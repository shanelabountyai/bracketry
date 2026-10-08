// PENDING in the starter: rename to .test.ts when the item starts (L-009). Spec: docs/prds/02-standings-bracket-spec.md §5–§7.
import { describe, expect, it } from 'vitest';
import { buildBracket, champion, recordResult, seedOrder } from '@/lib/league/bracket';
import type { Bracket, BracketMatch, BracketSlot } from '@/lib/league/types';
import { refuses } from './league-fixtures';

const seeds = (n: number) => Array.from({ length: n }, (_, i) => `S${i + 1}`);
const match = (b: Bracket, id: string): BracketMatch => b.rounds.flat().find((m) => m.id === id)!;
const show = (s: BracketSlot) => (s.kind === 'team' ? s.team : s.kind === 'bye' ? 'bye' : `→${s.matchId}`);
const round = (b: Bracket, n: number) => b.rounds[n - 1]!.map((m) => `${show(m.a)} v ${show(m.b)}`);

describe('seedOrder', () => {
  it('keeps the top seeds apart until the latest possible round', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(seedOrder(16)).toEqual([1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11]);
  });
  it('every first-round pair sums to size + 1', () => {
    for (const size of [2, 4, 8, 16, 32]) {
      const o = seedOrder(size);
      for (let i = 0; i < size; i += 2) expect(o[i]! + o[i + 1]!).toBe(size + 1);
      expect(o.slice().sort((a, b) => a - b)).toEqual(Array.from({ length: size }, (_, i) => i + 1));
    }
  });
  it('refuses a size that is not a power of two', () => {
    expect(refuses(() => seedOrder(6))).toBe(true);
    expect(refuses(() => seedOrder(1))).toBe(true);
  });
});

describe('buildBracket', () => {
  it('8 teams: 1v8, 4v5, 2v7, 3v6', () => {
    const b = buildBracket(seeds(8));
    expect(b.size).toBe(8);
    expect(b.rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    expect(round(b, 1)).toEqual(['S1 v S8', 'S4 v S5', 'S2 v S7', 'S3 v S6']);
    expect(round(b, 2)).toEqual(['→R1M1 v →R1M2', '→R1M3 v →R1M4']);
    expect(match(b, 'R1M3').winnerTo).toEqual({ matchId: 'R2M2', side: 'a' });
    expect(match(b, 'R3M1').winnerTo).toBeNull();
  });
  it('6 teams: seeds 1 and 2 get the byes and are already in round 2', () => {
    const b = buildBracket(seeds(6));
    expect(b.size).toBe(8);
    expect(round(b, 1)).toEqual(['S1 v bye', 'S4 v S5', 'S2 v bye', 'S3 v S6']);
    expect(round(b, 2)).toEqual(['S1 v →R1M2', 'S2 v →R1M4']);
    expect(match(b, 'R1M1')).toMatchObject({ winner: 'S1' });
    expect(match(b, 'R1M1').result).toBeUndefined();
  });
  it('12 teams: seeds 1 to 4 get the byes', () => {
    const b = buildBracket(seeds(12));
    expect(b.size).toBe(16);
    expect(round(b, 1)).toEqual(['S1 v bye', 'S8 v S9', 'S4 v bye', 'S5 v S12', 'S2 v bye', 'S7 v S10', 'S3 v bye', 'S6 v S11']);
    expect(round(b, 2)).toEqual(['S1 v →R1M2', 'S4 v →R1M4', 'S2 v →R1M6', 'S3 v →R1M8']);
  });
  it('5 teams: three byes, one first-round game', () => {
    expect(round(buildBracket(seeds(5)), 1)).toEqual(['S1 v bye', 'S4 v S5', 'S2 v bye', 'S3 v bye']);
    expect(round(buildBracket(seeds(5)), 2)).toEqual(['S1 v →R1M2', 'S2 v S3']);
  });
  it('2 teams is a final; fewer is refused', () => {
    expect(round(buildBracket(seeds(2)), 1)).toEqual(['S1 v S2']);
    expect(refuses(() => buildBracket(seeds(1)))).toBe(true);
    expect(refuses(() => buildBracket(['S1', 'S1']))).toBe(true);
  });
  it('team slots carry their seed', () => {
    expect(match(buildBracket(seeds(8)), 'R1M2').a).toEqual({ kind: 'team', team: 'S4', seed: 4 });
  });
});

describe('recordResult', () => {
  const win = (b: Bracket, id: string, side: 'a' | 'b') => recordResult(b, id, side === 'a' ? { aRuns: 5, bRuns: 1 } : { aRuns: 1, bRuns: 5 });

  it('feeds winners forward to a champion', () => {
    let b = buildBracket(seeds(8));
    expect(champion(b)).toBeNull();
    for (const id of ['R1M1', 'R1M2', 'R1M3', 'R1M4']) b = win(b, id, 'a');
    expect(round(b, 2)).toEqual(['S1 v S4', 'S2 v S3']);
    b = win(b, 'R2M1', 'a');
    b = win(b, 'R2M2', 'a');
    expect(round(b, 3)).toEqual(['S1 v S2']);
    b = win(b, 'R3M1', 'b');
    expect(champion(b)).toBe('S2');
  });
  it('an upset carries the lower seed forward with its seed number', () => {
    const b = win(buildBracket(seeds(8)), 'R1M1', 'b');
    expect(match(b, 'R2M1').a).toEqual({ kind: 'team', team: 'S8', seed: 8 });
    expect(match(b, 'R1M1').winner).toBe('S8');
  });
  it('returns a new bracket and leaves the old one alone', () => {
    const before = buildBracket(seeds(8));
    const after = win(before, 'R1M1', 'a');
    expect(match(before, 'R1M1').winner).toBeUndefined();
    expect(match(before, 'R2M1').a).toEqual({ kind: 'from', matchId: 'R1M1' });
    expect(after).not.toBe(before);
  });
  it('refuses a tie', () => {
    expect(refuses(() => recordResult(buildBracket(seeds(8)), 'R1M1', { aRuns: 3, bRuns: 3 }))).toBe(true);
  });
  it('a forfeit advances the other side whatever the runs say', () => {
    const b = recordResult(buildBracket(seeds(8)), 'R1M1', { aRuns: 0, bRuns: 0, forfeit: 'a' });
    expect(match(b, 'R1M1').winner).toBe('S8');
  });
  it('refuses a game whose teams are not known yet, and an unknown match', () => {
    expect(refuses(() => win(buildBracket(seeds(8)), 'R2M1', 'a'))).toBe(true);
    expect(refuses(() => win(buildBracket(seeds(8)), 'R9M9', 'a'))).toBe(true);
  });
  it('a result can be corrected until the next game has been played, not after', () => {
    let b = win(buildBracket(seeds(8)), 'R1M1', 'a');
    b = win(b, 'R1M1', 'b'); // correction: S8 actually won
    expect(match(b, 'R2M1').a).toMatchObject({ team: 'S8' });
    b = win(b, 'R1M2', 'a');
    b = win(b, 'R2M1', 'a');
    expect(refuses(() => win(b, 'R1M1', 'a'))).toBe(true);
  });
  it('a bye game cannot be given a result', () => {
    expect(refuses(() => win(buildBracket(seeds(6)), 'R1M1', 'a'))).toBe(true);
  });
});
