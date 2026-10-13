import { beforeEach, describe, expect, it } from 'vitest';
import { advanceClock } from '@/core/clock';
import { db } from '@/core/db';
import { requireOrg } from '@/core/authz/guards';
import { loadPublicLeague } from '@/app/l/public-league';
import { generateBracket } from '@/app/o/[org]/seasons/bracket-actions';
import { generate } from '@/app/o/[org]/seasons/generate-actions';
import { closeDay, regenerateRest } from '@/app/o/[org]/seasons/rainout-actions';
import { loadRainout } from '@/app/o/[org]/seasons/rainout-load';
import { recordResult, voidResult } from '@/app/o/[org]/seasons/result-actions';
import { loadStandings } from '@/app/o/[org]/seasons/standings-load';
import { publish, setPin } from '@/app/o/[org]/seasons/version-actions';
import { withdrawTeam } from '@/app/o/[org]/seasons/withdraw-actions';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-036: a team withdraws. The rainout suite's league: four teams, six games, Tuesdays from 2026-10-06 at 18:00 and
// 19:30 (America/Chicago). T3 has no contact email. Version 1 (seed 1) is published, and "today" is T0's first game day.
const SLUG = 'league';
const DAYS = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
let orgId: string;
let seasonId: string;
let divisionId: string;
let t0: string;
type Placed = Awaited<ReturnType<typeof placed>>[number];
let first: Placed; // T0's game today
let rest: Placed[]; // T0's later games

const setNow = (iso: string) => advanceClock(new Date(iso).getTime() - Date.now());
const version = (number: number) => db.scheduleVersion.findFirstOrThrow({ where: { seasonId, number } });
const placed = async (number: number) =>
  db.placement.findMany({ where: { scheduleVersion: { seasonId, number } }, orderBy: { fieldSlot: { day: 'asc' } }, select: { gameId: true, fieldSlotId: true, fieldSlot: { select: { day: true } }, game: { select: { key: true, homeTeamId: true, awayTeamId: true } } } });
const publishV = async (number: number, reason = 'Go') => publish(SLUG, { versionId: (await version(number)).id, reason });
const withdraw = (over: object = {}) => withdrawTeam(SLUG, { teamId: t0, reason: 'Not enough players', confirm: 'on', ...over });
const other = (p: Placed) => (p.game.homeTeamId === t0 ? p.game.awayTeamId : p.game.homeTeamId);

beforeEach(async () => {
  advanceClock(0);
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  orgId = org.id;
  await signInAs((await addMember(org.id, 'owner', 'o@example.test')).id, { mfa: true });
  seasonId = (await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } })).id;
  divisionId = (await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } })).id;
  for (let i = 0; i < 4; i++) await db.team.create({ data: { orgId, seasonId, divisionId, name: `T${i}`, contactEmail: i < 3 ? `t${i}@example.test` : null } });
  t0 = (await db.team.findFirstOrThrow({ where: { seasonId, name: 'T0' } })).id;
  const fieldId = (await db.field.create({ data: { orgId, name: 'F1' } })).id;
  await db.fieldSlot.createMany({ data: DAYS.flatMap((day) => ['18:00', '19:30'].map((start) => ({ orgId, seasonId, fieldId, day, start }))) });
  await generate(SLUG, { seasonId, seed: '1', maxIterations: '300' });
  await publishV(1);
  [first, ...rest] = (await placed(1)).filter((p) => p.game.homeTeamId === t0 || p.game.awayTeamId === t0) as [Placed, ...Placed[]];
  setNow(`${first.fieldSlot.day}T18:00:00Z`);
});

describe('withdrawTeam', () => {
  it('forfeits the unplayed games, drafts the schedule without them, and moves no other game', async () => {
    expect(rest).toHaveLength(2);
    // WD-01: today's game has no score yet, so nothing is forfeited.
    expect(await withdraw()).toEqual({ error: expect.stringContaining(`(${first.fieldSlot.day}). Enter those scores first`) });
    expect(await withdraw({ confirm: undefined })).toHaveProperty('error');
    expect(await db.gameResult.count()).toBe(0);
    expect((await db.team.findUniqueOrThrow({ where: { id: t0 } })).withdrawnAt).toBeNull();

    await recordResult(SLUG, { gameId: first.gameId, homeRuns: '3', awayRuns: '1' });
    await setPin(SLUG, { seasonId, gameId: rest[0]!.gameId, fieldSlotId: rest[0]!.fieldSlotId });
    expect(await withdraw()).toEqual({ notice: 'T0 has withdrawn. 2 unplayed games are recorded as forfeits by T0. Draft version 2 takes them off the schedule; every other game keeps its slot. Publish it to free the slots and tell the opponents.' });

    // WD-02: one forfeit row per unplayed game, by T0's side, with no date rule. The entered score is untouched.
    for (const p of rest) {
      expect(await db.gameResult.findMany({ where: { gameId: p.gameId } })).toMatchObject([{ forfeit: p.game.homeTeamId === t0 ? 'home' : 'away', homeRuns: 0, awayRuns: 0, reason: 'Withdrew: Not enough players', supersedesId: null }]);
    }
    expect(await db.gameResult.findMany({ where: { gameId: first.gameId } })).toMatchObject([{ forfeit: null, homeRuns: 3, awayRuns: 1 }]);
    expect(await db.pin.count()).toBe(0);
    expect(await withdraw()).toEqual({ error: 'T0 has already withdrawn.' });

    // WD-03, D-12 game by game: version 2 is version 1 without the two games.
    const v1 = await placed(1);
    const v2 = new Map((await placed(2)).map((p) => [p.gameId, p.fieldSlotId]));
    const gone = new Set(rest.map((p) => p.gameId));
    expect(v2.size).toBe(4);
    for (const p of v1) expect(v2.get(p.gameId)).toBe(gone.has(p.gameId) ? undefined : p.fieldSlotId);
    expect((await version(2)).report).toMatchObject({ hardCount: 0, unplaced: [], withdrawal: { of: 1, team: t0, removed: rest.map((p) => p.game.key).sort() } });
    expect(await db.outbox.count()).toBe(0); // D-18: on publish only

    // WD-04: T0 is outside the table; the forfeits are wins for the two opponents.
    const s = (await loadStandings(await requireOrg(SLUG), seasonId))!.byDivision[0]!;
    expect(s.rows.map((r) => r.team)).not.toContain(t0);
    expect(s.rows).toHaveLength(3);
    for (const p of rest) expect(s.rows.find((r) => r.team === other(p))).toMatchObject({ played: 1, wins: 1, points: 2, runsFor: 0, runDiff: 0 });
    const t0Won = first.game.homeTeamId === t0;
    expect(s.rows.find((r) => r.team === other(first))).toMatchObject({ played: 1, wins: t0Won ? 0 : 1, losses: t0Won ? 1 : 0 });
    expect(s.withdrawn).toMatchObject([{ name: 'T0', played: 3, wins: t0Won ? 1 : 0, losses: t0Won ? 2 : 3, points: t0Won ? 2 : 0 }]);
    expect(await generateBracket(SLUG, { seasonId, divisionId, n: '4' })).toEqual({ error: 'Open has only 3 teams.' });

    // Publishing tells each opponent with an email which game came off, and never the withdrawn team.
    const opponents = await db.team.findMany({ where: { id: { in: rest.map(other) }, contactEmail: { not: null } } });
    expect(await publishV(2, 'T0 withdrew')).toEqual({ notice: expect.stringContaining(`0 games changed slot and 2 came off the schedule; ${opponents.length} team notices queued`) });
    const sent = await db.outbox.findMany();
    expect(sent.map((m) => m.to).sort()).toEqual(opponents.map((o) => o.contactEmail).sort());
    for (const m of sent) expect((m.data as { body: string }).body).toMatch(/^T0 withdrew\n\n.*T0.*: was \d{4}-\d{2}-\d{2} \d{2}:\d{2} at F1, now off the schedule\.$/);

    // Spec 01 §10.4: once published, the games are not pairings, so nothing later counts or places them.
    const r = await loadRainout(await requireOrg(SLUG), seasonId);
    expect(r.rescheduleInput.games).toHaveLength(4);
    expect(await regenerateRest(SLUG, { seasonId, confirm: 'on' })).toEqual({ notice: expect.stringContaining('(0 unplaced)') });
    const v3 = await placed(3);
    expect(v3).toHaveLength(4);
    expect(v3.find((p) => p.gameId === first.gameId)?.fieldSlotId).toBe(first.fieldSlotId);

    // WD-05: the public page has the name and three ranked rows.
    const pub = (await loadPublicLeague(SLUG, seasonId))!.divisions[0]!;
    expect(pub.withdrew).toEqual(['T0']);
    expect(pub.standings.map((x) => x.team)).not.toContain('T0');
  });

  it('forfeits a rained-out game in the past, superseding a void, once its slot is closed', async () => {
    await recordResult(SLUG, { gameId: first.gameId, homeRuns: '3', awayRuns: '1' });
    await voidResult(SLUG, { gameId: first.gameId, reason: 'Wrong game' });
    expect(await withdraw()).toHaveProperty('error'); // unscored again, in an open slot today
    await closeDay(SLUG, { seasonId, day: first.fieldSlot.day });
    expect(await withdraw()).toEqual({ notice: expect.stringContaining('3 unplayed games are recorded as forfeits by T0. Draft version 2') });
    const rows = await db.gameResult.findMany({ where: { gameId: first.gameId }, orderBy: { enteredAt: 'asc' } });
    expect(rows).toHaveLength(3);
    expect(rows[2]).toMatchObject({ forfeit: first.game.homeTeamId === t0 ? 'home' : 'away', supersedesId: rows[1]!.id, voided: false });
    expect(await placed(2)).toHaveLength(3);
  });

  it('is refused before a version is published', async () => {
    const s = await db.season.create({ data: { orgId, name: 'Spring', timezone: 'America/Chicago', firstDay: '2027-04-05', lastDay: '2027-06-30', gameMinutes: 60, rules: {}, standingsConfig: {} } });
    const d = await db.division.create({ data: { orgId, seasonId: s.id, name: 'Open', legs: 1 } });
    const team = await db.team.create({ data: { orgId, seasonId: s.id, divisionId: d.id, name: 'Solo' } });
    expect(await withdraw({ teamId: team.id })).toEqual({ error: 'Publish a version first. A withdrawal is for a season in progress.' });
  });
});
