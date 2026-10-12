import { beforeEach, describe, expect, it } from 'vitest';
import { advanceClock } from '@/core/clock';
import { db } from '@/core/db';
import { generateBracket } from '@/app/o/[org]/seasons/bracket-actions';
import { generate } from '@/app/o/[org]/seasons/generate-actions';
import { publish } from '@/app/o/[org]/seasons/version-actions';
import { blankPublicGame, blankPublicMatch, blankPublicStanding, loadPublicLeague, MOVED_MARK_MS, toPublicGame, toPublicMatch, toPublicStanding } from '@/app/l/public-league';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-019: the public league page's data. Four teams, six games on Tuesdays from 2026-10-06, twelve slots,
// version 1 published. Every team has a contact email, which must never come back.
const SLUG = 'league';
const SECRET = /coach|example\.test|umpire|contactEmail|enteredBy|createdBy|[0-9a-f]{8}-[0-9a-f]{4}-/;
let orgId: string;
let seasonId: string;
let divisionId: string;
let ownerId: string;

const load = async () => (await loadPublicLeague(SLUG, seasonId))!;

/** A draft copied from the published version with one game moved to a free slot, then published. */
async function publishWithOneMove() {
  const v1 = await db.scheduleVersion.findFirstOrThrow({ where: { status: 'published' }, include: { placements: { include: { fieldSlot: { include: { field: true } }, game: { include: { homeTeam: true } } } } } });
  const free = await db.fieldSlot.findFirstOrThrow({ where: { placements: { none: {} } }, orderBy: [{ day: 'desc' }, { start: 'desc' }] });
  const moved = v1.placements[0]!;
  const v2 = await db.scheduleVersion.create({ data: { orgId, seasonId, number: 2, seed: 1n, inputHash: 'x', fingerprint: 'y', report: v1.report as object, iterations: 0, accepted: 0, createdBy: ownerId } });
  await db.placement.createMany({ data: v1.placements.map((p) => ({ orgId, seasonId, scheduleVersionId: v2.id, gameId: p.gameId, fieldSlotId: p.id === moved.id ? free.id : p.fieldSlotId })) });
  await publish(SLUG, { versionId: v2.id, reason: 'Rain' });
  return { home: moved.game.homeTeam.name, from: `${moved.fieldSlot.day} ${moved.fieldSlot.start} · ${moved.fieldSlot.field.name}`, to: free };
}

beforeEach(async () => {
  advanceClock(0);
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  orgId = org.id;
  ownerId = (await addMember(org.id, 'owner', 'o@example.test')).id;
  await signInAs(ownerId, { mfa: true });
  seasonId = (await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } })).id;
  divisionId = (await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } })).id;
  for (let i = 0; i < 4; i++) await db.team.create({ data: { orgId, seasonId, divisionId, name: `T${i}`, contactEmail: `coach${i}@example.test` } });
  const fieldId = (await db.field.create({ data: { orgId, name: 'F1' } })).id;
  const days = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
  await db.fieldSlot.createMany({ data: days.flatMap((day) => ['18:00', '19:30'].map((start) => ({ orgId, seasonId, fieldId, day, start }))) });
  await generate(SLUG, { seasonId, seed: '1', maxIterations: '300' });
});
const publishFirst = async () => publish(SLUG, { versionId: (await db.scheduleVersion.findFirstOrThrow()).id, reason: 'Go' });

describe('the projections are allowlists (PUB-03, spec §7c)', () => {
  const leak = { contactEmail: 'coach@example.test', dummyField: 'leak' };
  const slot = { day: '2026-10-06', start: '18:00', field: { name: 'F1', ...leak }, ...leak };
  const team = (name: string) => ({ name, ...leak });

  it('a game: a contact field or a new column on any row stays out', () => {
    const row = { ...leak, fieldSlot: slot, game: { ...leak, division: team('Open'), homeTeam: team('A'), awayTeam: team('B'), results: [{ homeRuns: 3, awayRuns: 1, forfeit: null, reason: 'umpire', enteredBy: 'x' }] } };
    const out = toPublicGame(row, slot);
    expect(Object.keys(out)).toEqual(Object.keys(blankPublicGame()));
    expect(JSON.stringify(out)).not.toMatch(/leak|coach|umpire/);
    expect(out).toMatchObject({ home: 'A', away: 'B', homeRuns: 3, awayRuns: 1, movedFrom: '2026-10-06 18:00 · F1' });
  });

  it('a standings row and a bracket match', () => {
    const row = { team: 'id-1', name: 'A', rank: 1, played: 1, wins: 1, losses: 0, ties: 0, points: 2, runsFor: 3, runsAgainst: 1, runDiff: 2, decidedBy: 'points', note: '1st on points', needsManualResolution: false, ...leak };
    expect(Object.keys(toPublicStanding(row))).toEqual(Object.keys(blankPublicStanding()));
    expect(JSON.stringify(toPublicStanding(row))).not.toMatch(/leak|coach|id-1/);
    const match = { id: 'R1M1', round: 1, index: 1, a: { kind: 'team' as const, team: 'id-1', seed: 1 }, b: { kind: 'bye' as const }, winner: 'id-1', winnerTo: null, ...leak };
    const out = toPublicMatch(match, slot, () => 'A');
    expect(Object.keys(out)).toEqual(Object.keys(blankPublicMatch()));
    expect(JSON.stringify(out)).not.toMatch(/leak|coach|id-1/);
    expect(out).toMatchObject({ a: '(1) A', b: 'bye', winner: 'A' });
  });
});

describe('loadPublicLeague', () => {
  it('is null until a version is published, and for another org or an unknown season', async () => {
    expect(await loadPublicLeague(SLUG, seasonId)).toBeNull(); // a draft exists
    await publishFirst();
    expect(await loadPublicLeague(SLUG, seasonId)).not.toBeNull();
    await makeOrg('other');
    expect(await loadPublicLeague('other', seasonId)).toBeNull();
    expect(await loadPublicLeague(SLUG, crypto.randomUUID())).toBeNull();
  });

  it('returns names, slots, fields and scores, and nothing internal (PUB-03)', async () => {
    await publishFirst();
    // The lower-numbered team wins every game (T0 3-0 … T3 0-3); the first game was entered wrong and corrected.
    const all = await db.game.findMany({ include: { homeTeam: true, awayTeam: true }, orderBy: { key: 'asc' } });
    const runs = (g: (typeof all)[number]) => (g.homeTeam.name < g.awayTeam.name ? { homeRuns: 5, awayRuns: 1 } : { homeRuns: 1, awayRuns: 5 });
    const g = all[0]!;
    const wrong = await db.gameResult.create({ data: { orgId, gameId: g.id, homeRuns: 9, awayRuns: 9, enteredBy: ownerId } });
    await db.gameResult.create({ data: { orgId, gameId: g.id, ...runs(g), supersedesId: wrong.id, reason: 'umpire card was misread', enteredBy: ownerId } });
    for (const x of all.slice(1)) await db.gameResult.create({ data: { orgId, gameId: x.id, ...runs(x), enteredBy: ownerId } });
    await generateBracket(SLUG, { seasonId, divisionId, n: '2' });

    const league = await load();
    expect(JSON.stringify(league)).not.toMatch(SECRET);
    expect(league.season).toBe('Fall');
    expect(league.games).toHaveLength(6);
    expect(league.games.map((x) => `${x.day} ${x.start}`)).toEqual(league.games.map((x) => `${x.day} ${x.start}`).sort());
    expect(league.games.every((x) => x.homeRuns !== null && x.homeRuns !== 9)).toBe(true); // the correction, not the 9-9
    const [d] = league.divisions;
    expect(d!.standings.map((r) => r.team).sort()).toEqual(['T0', 'T1', 'T2', 'T3']);
    expect(d!.standings[0]).toMatchObject({ rank: 1, team: 'T0', wins: 3, losses: 0 });
    expect(d!.bracket).toMatchObject([{ id: 'R1M1', a: '(1) T0', b: '(2) T1', slot: null, winner: null }]);
  });

  it('shows the published version only: a later draft changes nothing', async () => {
    await publishFirst();
    const before = await load();
    await generate(SLUG, { seasonId, seed: '2', maxIterations: '300' });
    expect(await db.scheduleVersion.count({ where: { status: 'draft' } })).toBe(1);
    expect(await load()).toEqual(before);
  });

  it('marks a moved game "moved from" for 7 days after the publish, and only that game (PUB-02)', async () => {
    await publishFirst();
    expect((await load()).games.filter((g) => g.movedFrom)).toEqual([]);
    const { home, from, to } = await publishWithOneMove();

    const marked = (await load()).games.filter((g) => g.movedFrom);
    expect(marked).toMatchObject([{ home, day: to.day, start: to.start, movedFrom: from }]);
    advanceClock(MOVED_MARK_MS - 60_000);
    expect((await load()).games.filter((g) => g.movedFrom)).toHaveLength(1);
    advanceClock(MOVED_MARK_MS + 60_000);
    const after = await load();
    expect(after.games.filter((g) => g.movedFrom)).toEqual([]);
    expect(after.games.find((g) => g.home === home && g.day === to.day)).toBeTruthy(); // still in its new slot
  });
});
