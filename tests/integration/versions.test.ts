import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { generate } from '@/app/o/[org]/seasons/generate-actions';
import { publish, setPin } from '@/app/o/[org]/seasons/version-actions';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-014: publish gate, supersede, pins. Four teams, six games, six Tuesdays of two slots.
const SLUG = 'league';
let seasonId: string;
let orgId: string;

async function league() {
  const s = await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } });
  seasonId = s.id;
  const d = await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } });
  for (let i = 0; i < 4; i++) await db.team.create({ data: { orgId, seasonId, divisionId: d.id, name: `T${i}` } });
  const f = await db.field.create({ data: { orgId, name: 'F1' } });
  const days = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
  await db.fieldSlot.createMany({ data: days.flatMap((day) => ['18:00', '19:30'].map((start) => ({ orgId, seasonId, fieldId: f.id, day, start }))) });
}
const gen = (seed: string) => generate(SLUG, { seasonId, seed, maxIterations: '300' });

beforeEach(async () => {
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  orgId = org.id;
  await signInAs((await addMember(org.id, 'owner', 'o@example.test')).id, { mfa: true });
  await league();
});

describe('publish', () => {
  it('publishes a draft with a reason and supersedes the previous published version', async () => {
    await gen('1');
    await gen('2');
    const [v1, v2] = await db.scheduleVersion.findMany({ orderBy: { number: 'asc' } });
    expect(await publish(SLUG, { versionId: v1!.id, reason: '' })).toEqual({ error: 'Give a reason for publishing.' });
    expect(await publish(SLUG, { versionId: v1!.id, reason: 'First cut' })).toEqual({ notice: 'Version 1 is published.' });
    await publish(SLUG, { versionId: v2!.id, reason: 'Better rest' });
    const after = await db.scheduleVersion.findMany({ orderBy: { number: 'asc' }, select: { status: true, reason: true, publishedAt: true } });
    expect(after.map((v) => v.status)).toEqual(['superseded', 'published']);
    expect(after[1]).toMatchObject({ reason: 'Better rest', publishedAt: expect.any(Date) });
    expect(await publish(SLUG, { versionId: v2!.id, reason: 'Again' })).toEqual({ error: 'Version 2 is published; only a draft can be published.' });
  });

  it('refuses a version with a hard violation or an unplaced game', async () => {
    await gen('1');
    const v = await db.scheduleVersion.findFirstOrThrow();
    await db.scheduleVersion.update({ where: { id: v.id }, data: { report: { ...(v.report as object), unplaced: ['L1:x'] } } });
    expect(await publish(SLUG, { versionId: v.id, reason: 'Go' })).toEqual({ error: expect.stringContaining('1 unplaced') });
    expect((await db.scheduleVersion.findFirstOrThrow()).status).toBe('draft');
  });

  it('the database allows one published version per season', async () => {
    await gen('1');
    await gen('2');
    const [v1, v2] = await db.scheduleVersion.findMany({ orderBy: { number: 'asc' } });
    await db.scheduleVersion.update({ where: { id: v1!.id }, data: { status: 'published' } });
    await expect(db.scheduleVersion.update({ where: { id: v2!.id }, data: { status: 'published' } })).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('pins', () => {
  it('refuses an illegal pin, then a legal pin is kept by the next generation', async () => {
    await gen('1');
    const g = await db.game.findFirstOrThrow({ where: { seasonId }, include: { homeTeam: true } });
    const slots = await db.fieldSlot.findMany({ where: { seasonId }, orderBy: [{ day: 'asc' }, { start: 'asc' }] });
    await db.blackout.create({ data: { orgId, teamId: g.homeTeamId, day: slots[0]!.day } });
    const bad = await setPin(SLUG, { seasonId, gameId: g.id, fieldSlotId: slots[0]!.id });
    expect(bad).toEqual({ error: expect.stringContaining(g.homeTeam.name) });
    expect(await db.pin.count()).toBe(0);

    const target = slots[7]!;
    expect(await setPin(SLUG, { seasonId, gameId: g.id, fieldSlotId: target.id })).toMatchObject({ notice: expect.stringContaining('Pinned') });
    expect(await setPin(SLUG, { seasonId, gameId: g.id, fieldSlotId: slots[8]!.id })).toEqual({ error: expect.stringContaining('already pinned') });
    await gen('2');
    const v = await db.scheduleVersion.findFirstOrThrow({ where: { number: 2 } });
    expect((await db.placement.findFirstOrThrow({ where: { scheduleVersionId: v.id, gameId: g.id } })).fieldSlotId).toBe(target.id);
  });
});
