import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { recordTie, saveChain } from '@/app/o/[org]/seasons/standings-actions';
import { requireOrg } from '@/core/authz/guards';
import { loadStandings } from '@/app/o/[org]/seasons/standings-load';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-016: standings on read, the chain editor and the commissioner's tie decision. Three teams in a cycle:
// A 1-0 B, B 1-0 C, C 1-0 A leaves every metric level, so the chain cannot separate them.
const SLUG = 'league';
let orgId: string;
let seasonId: string;
let divisionId: string;
let t: Record<'A' | 'B' | 'C', string>;
const STEPS = ['h2h', 'rd-tied', 'rd-all', 'ra-all'];
const pos = (ids: string[]) => Object.fromEntries(ids.map((id, i) => [`pos_${id}`, String(i + 1)]));

beforeEach(async () => {
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  orgId = org.id;
  const owner = await addMember(org.id, 'owner', 'o@example.test');
  await signInAs(owner.id, { mfa: true });
  seasonId = (await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } })).id;
  divisionId = (await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } })).id;
  const [A, B, C] = await Promise.all(['A', 'B', 'C'].map(async (name) => (await db.team.create({ data: { orgId, seasonId, divisionId, name } })).id));
  t = { A: A!, B: B!, C: C! };
});

async function play(home: string, away: string, homeRuns: number, awayRuns: number) {
  const g = await db.game.create({ data: { orgId, seasonId, divisionId, key: `${home}~${away}`, round: 1, leg: 1, homeTeamId: home, awayTeamId: away } });
  return db.gameResult.create({ data: { orgId, gameId: g.id, homeRuns, awayRuns, enteredBy: crypto.randomUUID() } });
}
const cycle = async () => { await play(t.A, t.B, 1, 0); await play(t.B, t.C, 1, 0); await play(t.C, t.A, 1, 0); };

describe('loadStandings', () => {
  it('uses the newest score of a game and shows team names in the reasons', async () => {
    const first = await play(t.A, t.B, 1, 0);
    const g = first.gameId;
    await db.gameResult.create({ data: { orgId, gameId: g, homeRuns: 0, awayRuns: 2, supersedesId: first.id, reason: 'Misread', enteredBy: crypto.randomUUID() } });
    const rows = (await loadStandings(await requireOrg(SLUG), seasonId))!.byDivision[0]!.rows;
    expect([rows[0]!.name, rows[0]!.points]).toEqual(['B', 2]); // the correction flipped the winner
    expect([rows[1]!.name, rows[1]!.note]).toEqual(['C', '2nd via overall run differential over A']); // names, not ids (D-22)
  });

  it('adds hypothetical scores for unplayed games only, and the points range over what is left (L-023)', async () => {
    const played = await play(t.A, t.B, 1, 0);
    const open = await db.game.create({ data: { orgId, seasonId, divisionId, key: 'open', round: 2, leg: 1, homeTeamId: t.B, awayTeamId: t.C } });
    const ctx = await requireOrg(SLUG);
    const flags = (d: { range: { team: string; bestRank: number; worstRank: number }[] | null }) => d.range?.map((x) => `${Object.entries(t).find(([, id]) => id === x.team)![0]}:${x.bestRank}-${x.worstRank}`).sort();

    const real = (await loadStandings(ctx, seasonId, {}))!.byDivision[0]!;
    expect([real.open.map((g) => g.id), real.supposed]).toEqual([[open.id], 0]);
    expect(flags(real)).toEqual(['A:1-2', 'B:1-3', 'C:1-3']); // whoever wins the open game draws level with A on 2

    // A score for the played game is ignored; the one for the open game counts.
    const supposed = (await loadStandings(ctx, seasonId, { [played.gameId]: { homeRuns: 0, awayRuns: 9 }, [open.id]: { homeRuns: 0, awayRuns: 5 } }))!.byDivision[0]!;
    expect(supposed.rows.map((r) => [r.name, r.points])).toEqual([['C', 2], ['A', 2], ['B', 0]]);
    expect([supposed.supposed, flags(supposed)]).toEqual([1, ['A:1-2', 'B:3-3', 'C:1-2']]);

    expect((await loadStandings(ctx, seasonId))!.byDivision[0]).toMatchObject({ open: [], range: null }); // other callers pay nothing
  });
});

describe('crossover games (L-026, D-40)', () => {
  it('a crossover result counts in each team\'s own division, and an open one is in both divisions\' arithmetic', async () => {
    const rec = await db.division.create({ data: { orgId, seasonId, name: 'Rec', legs: 1 } });
    const z = (await db.team.create({ data: { orgId, seasonId, divisionId: rec.id, name: 'Z' } })).id;
    await play(t.A, z, 4, 1); // stored under the home team's division, Open
    const open = await db.game.create({ data: { orgId, seasonId, divisionId: rec.id, key: 'X:open', round: 2, leg: 1, homeTeamId: z, awayTeamId: t.B } });

    const [openDiv, recDiv] = (await loadStandings(await requireOrg(SLUG), seasonId, {}))!.byDivision;
    expect(openDiv!.rows[0]).toMatchObject({ name: 'A', played: 1, points: 2, runsFor: 4, runsAgainst: 1 });
    expect(recDiv!.rows).toEqual([expect.objectContaining({ name: 'Z', played: 1, losses: 1, points: 0, runsAgainst: 4 })]);
    expect(openDiv!.open).toEqual([expect.objectContaining({ id: open.id, listed: false })]);
    expect(recDiv!.open).toEqual([expect.objectContaining({ id: open.id, listed: true })]);
    expect([openDiv!.name(z), recDiv!.name(t.B)]).toEqual(['Z', 'B']);
  });
});

describe('recordTie', () => {
  it('flags a cycle as unresolved, takes a decision for exactly that group, and appends corrections', async () => {
    await cycle();
    const ctx = await requireOrg(SLUG);
    const flagged = (await loadStandings(ctx, seasonId))!.byDivision[0]!.rows;
    expect(flagged.map((r) => [r.rank, r.needsManualResolution])).toEqual([[1, true], [1, true], [1, true]]);

    expect(await recordTie(SLUG, { seasonId, divisionId, method: 'coin flip', ...pos([t.A, t.B]) })).toEqual({ error: expect.stringContaining('already decided or has changed') });
    expect(await recordTie(SLUG, { seasonId, divisionId, method: 'coin flip', [`pos_${t.A}`]: '1', [`pos_${t.B}`]: '1', [`pos_${t.C}`]: '2' })).toEqual({ error: expect.stringContaining('own position') });
    expect(await recordTie(SLUG, { seasonId, divisionId, method: 'coin flip', ...pos([t.C, t.A, t.B]) })).toEqual({ notice: expect.stringContaining('Decision recorded') });

    const decided = (await loadStandings(ctx, seasonId))!.byDivision[0]!.rows;
    expect(decided.map((r) => [r.name, r.rank, r.needsManualResolution])).toEqual([['C', 1, false], ['A', 2, false], ['B', 3, false]]);
    expect(decided[0]!.note).toBe('1st by commissioner decision over A and B');

    expect(await recordTie(SLUG, { seasonId, divisionId, method: 'drawn lots', ...pos([t.A, t.B, t.C]) })).toEqual({ error: expect.stringContaining('already decided') });
    expect(await db.tieResolution.count()).toBe(1);
  });
});

describe('saveChain', () => {
  it('changes freely before any score, and logs a reasoned change after one', async () => {
    const reordered = ['rd-all', 'h2h', 'rd-tied', 'ra-all'];
    expect(await saveChain(SLUG, { seasonId, onPartialBreak: 'continue', ...pos(reordered) })).toEqual({ notice: 'Tiebreakers saved.' });
    expect((await db.season.findFirstOrThrow()).standingsConfigVersion).toBe(2);

    await cycle();
    expect(await saveChain(SLUG, { seasonId, onPartialBreak: 'restart', ...pos(STEPS) })).toEqual({ error: expect.stringContaining('give a reason') });
    expect(await saveChain(SLUG, { seasonId, onPartialBreak: 'restart', reason: 'League vote', ...pos(STEPS) })).toEqual({ notice: 'Tiebreakers saved.' });
    const log = await db.auditEvent.findMany({ where: { action: 'season.tiebreak_changed' }, orderBy: { at: 'asc' } });
    expect(log).toHaveLength(2);
    expect(log[1]!.data).toMatchObject({ version: 3, reason: 'League vote', before: { chain: reordered }, after: { chain: STEPS, onPartialBreak: 'restart' } });
  });

  it('refuses a position list that is not a permutation', async () => {
    expect(await saveChain(SLUG, { seasonId, onPartialBreak: 'restart', ...pos(['h2h', 'h2h', 'rd-all', 'ra-all']) })).toEqual({ error: expect.stringContaining('own position') });
  });
});
