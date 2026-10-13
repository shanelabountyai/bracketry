import { beforeEach, describe, expect, it } from 'vitest';
import { advanceClock } from '@/core/clock';
import { db } from '@/core/db';
import { addSlot } from '@/app/o/[org]/seasons/actions';
import { generate } from '@/app/o/[org]/seasons/generate-actions';
import { closeDay, proposeReschedule, regenerateRest } from '@/app/o/[org]/seasons/rainout-actions';
import { recordResult } from '@/app/o/[org]/seasons/result-actions';
import { publish, setPin } from '@/app/o/[org]/seasons/version-actions';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-017: rainout tool. Four teams, six games, Tuesdays from 2026-10-06 at 18:00 and 19:30 (America/Chicago).
// T3 has no contact email. Version 1 is generated with seed 1 and published before each test.
const SLUG = 'league';
const DAYS = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
let orgId: string;
let seasonId: string;
let fieldId: string;

const setNow = (iso: string) => advanceClock(new Date(iso).getTime() - Date.now());
const gen = (seed: string) => generate(SLUG, { seasonId, seed, maxIterations: '300' });
const version = (number: number) => db.scheduleVersion.findFirstOrThrow({ where: { seasonId, number } });
const placed = async (number: number) =>
  db.placement.findMany({ where: { scheduleVersion: { seasonId, number } }, select: { gameId: true, fieldSlotId: true, fieldSlot: { select: { day: true, status: true } }, game: { select: { key: true, homeTeamId: true, awayTeamId: true } } } });
const publishV = async (number: number, reason = 'Go') => publish(SLUG, { versionId: (await version(number)).id, reason });
const score = (gameId: string) => recordResult(SLUG, { gameId, homeRuns: '3', awayRuns: '1' });

beforeEach(async () => {
  advanceClock(0);
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  orgId = org.id;
  await signInAs((await addMember(org.id, 'owner', 'o@example.test')).id, { mfa: true });
  const s = await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } });
  seasonId = s.id;
  const d = await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } });
  for (let i = 0; i < 4; i++) await db.team.create({ data: { orgId, seasonId, divisionId: d.id, name: `T${i}`, contactEmail: i < 3 ? `t${i}@example.test` : null } });
  fieldId = (await db.field.create({ data: { orgId, name: 'F1' } })).id;
  await db.fieldSlot.createMany({ data: DAYS.flatMap((day) => ['18:00', '19:30'].map((start) => ({ orgId, seasonId, fieldId, day, start }))) });
  await gen('1');
  await publishV(1);
});

describe('reschedule', () => {
  it('moves only the displaced games, never into the past, and publishing queues one notice per affected team', async () => {
    setNow('2026-10-14T18:00:00Z');
    const v1 = await placed(1);
    const rainDay = v1.map((p) => p.fieldSlot.day).filter((d) => d > '2026-10-14').sort()[0]!;
    const displaced = v1.filter((p) => p.fieldSlot.day === rainDay);
    // A pin on a slot about to close: closing removes it (open from L-014).
    await setPin(SLUG, { seasonId, gameId: displaced[0]!.gameId, fieldSlotId: displaced[0]!.fieldSlotId });

    expect(await closeDay(SLUG, { seasonId, day: rainDay })).toEqual({ notice: `Closed 2 slots on ${rainDay}. Removed 1 pins that pointed at them. ${displaced.length} published games are displaced.` });
    expect(await db.pin.count()).toBe(0);
    expect(await closeDay(SLUG, { seasonId, day: rainDay })).toEqual({ error: `No open slots on ${rainDay}.` });
    // A makeup day may fall after the season's last day.
    for (const start of ['18:00', '19:30']) expect(await addSlot(SLUG, { seasonId, fieldId, day: '2027-01-05', start, makeup: 'on' })).toBeUndefined();
    expect(await db.fieldSlot.count({ where: { status: 'makeup' } })).toBe(2);

    expect(await proposeReschedule(SLUG, { seasonId })).toEqual({ notice: `Draft version 2: ${displaced.length} of ${displaced.length} displaced games moved, 0 have no legal slot. Every other game kept its slot.` });
    const v2 = new Map((await placed(2)).map((p) => [p.gameId, p]));
    expect(v2.size).toBe(6);
    // D-12, game by game.
    for (const p of v1.filter((x) => x.fieldSlot.day !== rainDay)) expect(v2.get(p.gameId)!.fieldSlotId).toBe(p.fieldSlotId);
    for (const p of displaced) {
      expect(v2.get(p.gameId)!.fieldSlot.status).not.toBe('closed');
      expect(v2.get(p.gameId)!.fieldSlot.day > '2026-10-14').toBe(true); // D-23
    }
    const report = (await version(2)).report as { reschedule: { of: number; moved: unknown[] } };
    expect(report.reschedule).toMatchObject({ of: 1 });
    expect(report.reschedule.moved).toHaveLength(displaced.length);
    expect(await db.outbox.count()).toBe(0); // D-18: on publish only

    const teams = await db.team.findMany({ where: { id: { in: displaced.flatMap((p) => [p.game.homeTeamId, p.game.awayTeamId]) } } });
    const reachable = teams.filter((t) => t.contactEmail);
    const res = await publishV(2, 'Rain on the 20th');
    expect(res).toEqual({ notice: expect.stringContaining(`${displaced.length} games changed slot; ${reachable.length} team notices queued`) });
    const sent = await db.outbox.findMany();
    expect(sent.map((m) => m.to).sort()).toEqual(reachable.map((t) => t.contactEmail).sort());
    for (const m of sent) {
      const t = reachable.find((x) => x.contactEmail === m.to)!;
      const body = (m.data as { body: string }).body;
      expect(body).toContain(t.name);
      expect(body).toContain(`was ${rainDay}`);
      expect(body).toMatch(/now \d{4}-\d{2}-\d{2} \d{2}:\d{2} at F1\./);
      expect(m).toMatchObject({ channel: 'email', template: 'notice', orgId });
    }
  });

  it('lists a displaced game with no legal slot as unplaced with the reason, and the draft cannot be published', async () => {
    const v1 = await placed(1);
    const last = v1.map((p) => p.fieldSlot.day).sort().at(-1)!;
    const displaced = v1.filter((p) => p.fieldSlot.day === last);
    // The day before the last game day: every earlier free slot is past, and every later day is closed too.
    setNow(`${DAYS[DAYS.indexOf(last) - 1]}T18:00:00Z`);
    for (const day of DAYS.filter((d) => d >= last)) await closeDay(SLUG, { seasonId, day });

    expect(await proposeReschedule(SLUG, { seasonId })).toEqual({ notice: expect.stringContaining(`0 of ${displaced.length} displaced games moved, ${displaced.length} have no legal slot`) });
    const v2 = await placed(2);
    expect(v2).toHaveLength(6 - displaced.length);
    expect(new Set(v2.map((p) => p.fieldSlotId)).size).toBe(v2.length);
    const report = (await version(2)).report as { hardCount: number; unplaced: string[]; reschedule: { unplaced: Record<string, string> } };
    expect(report.hardCount).toBe(0);
    expect(report.unplaced.sort()).toEqual(displaced.map((p) => p.game.key).sort());
    for (const p of displaced) expect(report.reschedule.unplaced[p.game.key]).toBe('No free slot is left. Add a makeup slot.');
    expect(await publishV(2)).toEqual({ error: expect.stringContaining(`${displaced.length} unplaced`) });
  });
});

describe('played games', () => {
  it('a scored game in a closed slot is not displaced, and "regenerate the rest" keeps it where it was played', async () => {
    const v1 = await placed(1);
    const first = v1.map((p) => p.fieldSlot.day).sort()[0]!;
    const played = v1.filter((p) => p.fieldSlot.day === first);
    setNow(`${first}T23:00:00Z`);
    for (const p of played) expect(await score(p.gameId)).toMatchObject({ notice: 'Score saved.' });

    expect(await closeDay(SLUG, { seasonId, day: first })).toEqual({ notice: expect.stringContaining('0 published games are displaced') });
    expect(await proposeReschedule(SLUG, { seasonId })).toEqual({ error: expect.stringContaining('nothing to reschedule') });

    expect(await regenerateRest(SLUG, { seasonId })).toEqual({ error: 'Tick the box to confirm that unplayed games may move.' });
    expect(await regenerateRest(SLUG, { seasonId, confirm: 'on' })).toEqual({ notice: expect.stringContaining(`Draft version 2 keeps the ${played.length} played games`) });
    const v2 = new Map((await placed(2)).map((p) => [p.gameId, p]));
    expect(v2.size).toBe(6);
    for (const p of played) expect(v2.get(p.gameId)!.fieldSlotId).toBe(p.fieldSlotId);
    for (const p of v1.filter((x) => x.fieldSlot.day !== first)) expect(v2.get(p.gameId)!.fieldSlot.day > first).toBe(true);
    expect((await version(2)).report).toMatchObject({ regenerated: { of: 1, kept: played.length, unplayed: 6 - played.length } });
    // A played game sitting in a closed slot does not block the publish.
    expect(await publishV(2, 'Rest of season')).toMatchObject({ notice: expect.stringContaining('Version 2 is published.') });
  });
});

describe('plain generate after a score (GEN-08)', () => {
  it('is refused and stores nothing once any game has a score', async () => {
    const first = (await placed(1)).sort((a, b) => (a.fieldSlot.day < b.fieldSlot.day ? -1 : 1))[0]!;
    setNow(`${first.fieldSlot.day}T23:00:00Z`);
    await score(first.gameId);
    expect(await gen('2')).toEqual({ error: expect.stringContaining('Regenerate the rest') });
    expect(await db.scheduleVersion.count({ where: { seasonId } })).toBe(1);
  });
});

describe('publishing a stale draft', () => {
  it('refuses a draft that uses a slot closed since, or that moves a game scored since', async () => {
    await gen('2');
    const [v1, v2] = [await placed(1), await placed(2)];
    const day = v2.map((p) => p.fieldSlot.day).sort().at(-1)!;
    const hit = v2.filter((p) => p.fieldSlot.day === day).length;
    await closeDay(SLUG, { seasonId, day });
    expect(await publishV(2)).toEqual({ error: `Version 2 puts ${hit} unplayed games in slots that are now closed. Propose a new version.` });

    await gen('3');
    const v3 = new Map((await placed(3)).map((p) => [p.gameId, p.fieldSlotId]));
    const moved = v1.filter((p) => v3.get(p.gameId) !== p.fieldSlotId).sort((a, b) => (a.fieldSlot.day < b.fieldSlot.day ? -1 : 1))[0];
    expect(moved).toBeDefined();
    setNow(`${moved!.fieldSlot.day}T23:00:00Z`);
    await score(moved!.gameId);
    expect(await publishV(3)).toEqual({ error: 'Version 3 moves 1 games that already have a score. Propose a new version.' });
    expect((await version(1)).status).toBe('published');
  });
});
