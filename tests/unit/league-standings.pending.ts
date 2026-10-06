// PENDING in the starter: rename to .test.ts when the item starts (L-008). Spec: docs/prds/02-standings-bracket-spec.md §1–§4, where each fixture is worked by hand.
import { describe, expect, it } from 'vitest';
import { computeStandings } from '@/lib/league/standings';
import { DEFAULT_STANDINGS, type GameResult, type StandingsRow } from '@/lib/league/types';
import { lazy, r } from './league-fixtures';

const order = (rows: StandingsRow[]) => rows.map((x) => `${x.rank}:${x.team}:${x.decidedBy}`);
const ABCD = ['A', 'B', 'C', 'D'];

describe('ST-1 no ties', () => {
  const standings = lazy(() => computeStandings(['A', 'B', 'C'], [r('A', 3, 'B', 1), r('A', 2, 'C', 0), r('B', 4, 'C', 3)], DEFAULT_STANDINGS));
  it('ranks on points and says so', () => {
    const rows = standings();
    expect(order(rows)).toEqual(['1:A:points', '2:B:points', '3:C:points']);
    expect(rows[0]).toMatchObject({ played: 2, wins: 2, losses: 0, ties: 0, points: 4, runsFor: 5, runsAgainst: 1, runDiff: 4, needsManualResolution: false });
  });
});

describe('ST-2 two two-way ties: head-to-head beats run differential', () => {
  // A and B finish on 4 points, C and D on 2. B has the better differential (+5 to +1) but lost to A.
  const results = [r('A', 3, 'B', 2), r('A', 4, 'C', 0), r('D', 5, 'A', 1), r('B', 6, 'C', 1), r('B', 2, 'D', 1), r('C', 3, 'D', 2)];
  const standings = lazy(() => computeStandings(ABCD, results, DEFAULT_STANDINGS));
  it('orders each pair by the game between them', () => {
    const rows = standings();
    expect(order(rows)).toEqual(['1:A:h2h', '2:B:h2h', '3:C:h2h', '4:D:h2h']);
    expect(rows.map((x) => x.runDiff)).toEqual([1, 5, -8, 2]);
  });
  it('explains the row in plain language', () => {
    const rows = standings();
    expect(rows[0]!.note).toMatch(/head-to-head/i);
    expect(rows[0]!.note).toContain('B');
  });
  it('does not depend on the order of teams or results', () => {
    const rows = standings();
    const again = computeStandings(['D', 'B', 'A', 'C'], results.slice().reverse(), DEFAULT_STANDINGS);
    expect(again).toEqual(rows);
  });
});

describe('ST-3 the three-way circle', () => {
  // A beat B, B beat C, C beat A; all three beat D. Head-to-head is level at 2 points each.
  // Differential among the three: A +2, B −1, C −1. A is first; B and C are still tied.
  const results = [r('A', 5, 'B', 1), r('B', 4, 'C', 1), r('C', 3, 'A', 1), r('A', 6, 'D', 2), r('B', 2, 'D', 1), r('C', 9, 'D', 0)];
  it('restart: the chain starts again for B and C, and B beat C', () => {
    const rows = computeStandings(ABCD, results, DEFAULT_STANDINGS);
    expect(order(rows)).toEqual(['1:A:rd-tied', '2:B:h2h', '3:C:h2h', '4:D:points']);
  });
  it('continue: B and C go on to overall differential, where C leads +6 to 0', () => {
    const rows = computeStandings(ABCD, results, { ...DEFAULT_STANDINGS, onPartialBreak: 'continue' });
    expect(order(rows)).toEqual(['1:A:rd-tied', '2:C:rd-all', '3:B:rd-all', '4:D:points']);
    expect(rows.map((x) => x.runDiff)).toEqual([6, 6, 0, -12]); // C's 9–0 counts as +7
  });
});

describe('ST-4 the cap, skipped head-to-head, and a tie nothing breaks', () => {
  // A beat B 15–0 and C beat D 8–0. A and C never met, so both 'tied'-scope steps are skipped.
  // Capped differential is +7 each and both allowed 0 runs: unresolved.
  const results = [r('A', 15, 'B', 0), r('C', 8, 'D', 0)];
  it('shares the rank, flags it, and still orders the teams below', () => {
    const rows = computeStandings(ABCD, results, DEFAULT_STANDINGS);
    expect(order(rows)).toEqual(['1:A:unresolved', '1:C:unresolved', '3:D:ra-all', '4:B:ra-all']);
    expect(rows.map((x) => x.needsManualResolution)).toEqual([true, true, false, false]);
    expect(rows.map((x) => [x.runsFor, x.runDiff])).toEqual([[15, 7], [8, 7], [0, -7], [0, -7]]);
  });
  it('ST-5: a logged commissioner decision settles it', () => {
    const rows = computeStandings(ABCD, results, { ...DEFAULT_STANDINGS, manualResolutions: [['C', 'A']] });
    expect(order(rows)).toEqual(['1:C:manual', '2:A:manual', '3:D:ra-all', '4:B:ra-all']);
    expect(rows.some((x) => x.needsManualResolution)).toBe(false);
  });
});

describe('ST-6 forfeits', () => {
  const forfeit: GameResult = { home: 'A', away: 'B', homeRuns: 0, awayRuns: 0, forfeit: 'away' };
  it('count as a win and a loss but stay out of the runs by default', () => {
    const rows = computeStandings(['A', 'B'], [forfeit], DEFAULT_STANDINGS);
    expect(rows[0]).toMatchObject({ team: 'A', wins: 1, points: 2, runsFor: 0, runsAgainst: 0, runDiff: 0 });
    expect(rows[1]).toMatchObject({ team: 'B', losses: 1, points: 0, runDiff: 0 });
  });
  it('count in the runs at the forfeit score when the league says so', () => {
    const rows = computeStandings(['A', 'B'], [forfeit], { ...DEFAULT_STANDINGS, forfeitCountsInRuns: true });
    expect(rows[0]).toMatchObject({ team: 'A', runsFor: 7, runsAgainst: 0, runDiff: 7 });
    expect(rows[1]).toMatchObject({ team: 'B', runsFor: 0, runsAgainst: 7, runDiff: -7 });
  });
});

describe('ST-7 a tied game', () => {
  it('gives each side one point', () => {
    const rows = computeStandings(['A', 'B', 'C'], [r('A', 4, 'B', 4), r('A', 2, 'C', 1)], DEFAULT_STANDINGS);
    expect(order(rows)).toEqual(['1:A:points', '2:B:points', '3:C:points']);
    expect(rows.map((x) => [x.wins, x.losses, x.ties, x.points])).toEqual([[1, 0, 1, 3], [0, 0, 1, 1], [0, 1, 0, 0]]);
  });
});

describe('ST-8 mid-season: head-to-head is skipped until the tied teams have all met equally', () => {
  // A, B and C have 2 points each. Only A–B has been played among them.
  // Applied naively, head-to-head would put A first. Skipped, overall differential decides: C +7, A +1, B 0.
  const results = [r('A', 1, 'B', 0), r('B', 2, 'D', 1), r('C', 10, 'D', 0)];
  it('falls through to the first all-games step', () => {
    const rows = computeStandings(ABCD, results, DEFAULT_STANDINGS);
    expect(order(rows)).toEqual(['1:C:rd-all', '2:A:rd-all', '3:B:rd-all', '4:D:points']);
  });
});

describe('ST-9 before a game is played', () => {
  it('everyone shares first and nothing is invented', () => {
    const rows = computeStandings(['B', 'A', 'C'], [], DEFAULT_STANDINGS);
    expect(order(rows)).toEqual(['1:A:unresolved', '1:B:unresolved', '1:C:unresolved']);
    expect(rows.every((x) => x.played === 0 && x.points === 0)).toBe(true);
  });
});
