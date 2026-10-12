import { beforeEach, describe, expect, it } from 'vitest';
import { requireOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { generate } from '@/app/o/[org]/seasons/generate-actions';
import { loadQuality } from '@/app/o/[org]/seasons/quality-load';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-020: the quality table through the real loader. Four teams, six games, six Tuesdays of two slots.
const SLUG = 'league';
let seasonId: string;
let orgId: string;

beforeEach(async () => {
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  orgId = org.id;
  await signInAs((await addMember(org.id, 'owner', 'o@example.test')).id, { mfa: true });
  const s = await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } });
  seasonId = s.id;
  const d = await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } });
  for (let i = 0; i < 4; i++) await db.team.create({ data: { orgId, seasonId, divisionId: d.id, name: `T${i}` } });
  const f = await db.field.create({ data: { orgId, name: 'F1' } });
  const days = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
  await db.fieldSlot.createMany({ data: days.flatMap((day) => ['18:00', '19:30'].map((start) => ({ orgId, seasonId, fieldId: f.id, day, start }))) });
});

describe('loadQuality', () => {
  it('re-scores a stored version to the score it was saved with, and counts every team', async () => {
    await generate(SLUG, { seasonId, seed: '42', maxIterations: '300' });
    const q = await loadQuality(await requireOrg(SLUG), seasonId);
    expect(q.version!.number).toBe(1);
    expect(q.quality!.report.softCost).toBe(q.stored!.softCost);
    expect(q.quality!.report.hardCount).toBe(0);
    expect(q.quality!.teams).toHaveLength(4);
    for (const t of q.quality!.teams) {
      expect(t).toMatchObject({ games: 3, byes: 3 }); // 3 games in 6 one-day weeks, one game a day
      expect(t.home + t.away).toBe(3);
      expect(t.byStart['18:00']! + t.byStart['19:30']!).toBe(3);
    }
    expect(q.quality!.floor.cost).toBe(0);
  });

  it('still counts a game whose slot was closed after the version was made', async () => {
    await generate(SLUG, { seasonId, seed: '42', maxIterations: '300' });
    const used = await db.placement.findFirstOrThrow({ select: { fieldSlotId: true } });
    await db.fieldSlot.update({ where: { id: used.fieldSlotId }, data: { status: 'closed' } });
    const q = await loadQuality(await requireOrg(SLUG), seasonId, 1);
    expect(q.quality!.report.hardCount).toBe(0);
    expect(q.quality!.teams.reduce((n, t) => n + t.games, 0)).toBe(12);
  });

  it('has no version to show before a schedule exists, or for a number that does not', async () => {
    expect((await loadQuality(await requireOrg(SLUG), seasonId)).version).toBeNull();
    await generate(SLUG, { seasonId, seed: '42', maxIterations: '300' });
    expect((await loadQuality(await requireOrg(SLUG), seasonId, 9)).version).toBeNull();
  });
});
