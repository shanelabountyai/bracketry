// PENDING in the starter: rename to .test.ts when the item starts (L-003). Spec: docs/prds/01-generator-spec.md §2.
// Completeness is ASSERTED for every size from 2 to 16, never assumed (GEN-02).
import { describe, expect, it } from 'vitest';
import { gameKey, roundRobin } from '@/lib/league/round-robin';
import { refuses, teamIds } from './league-fixtures';

const sizes = Array.from({ length: 15 }, (_, i) => i + 2); // 2..16

describe('gameKey', () => {
  it('is the same whichever team is named first', () => {
    expect(gameKey(1, 'T02', 'T01')).toBe('L1:T01~T02');
    expect(gameKey(2, 'T01', 'T02')).toBe('L2:T01~T02');
  });
});

describe.each(sizes)('roundRobin with %i teams', (n) => {
  const teams = teamIds(n);
  const m = n % 2 === 0 ? n : n + 1;

  it('single: every pair meets exactly once', () => {
    const rr = roundRobin(teams, { legs: 1 });
    const seen = new Map<string, number>();
    for (const p of rr.rounds.flat()) seen.set(p.key, (seen.get(p.key) ?? 0) + 1);
    expect(seen.size).toBe((n * (n - 1)) / 2);
    expect([...seen.values()].every((c) => c === 1)).toBe(true);
    for (const a of teams) for (const b of teams) if (a < b) expect(seen.has(`L1:${a}~${b}`)).toBe(true);
  });

  it('single: m − 1 rounds, nobody twice in a round, one bye per round when odd', () => {
    const rr = roundRobin(teams, { legs: 1 });
    expect(rr.rounds).toHaveLength(m - 1);
    expect(rr.byes).toHaveLength(m - 1);
    const byeCount = new Map<string, number>();
    rr.rounds.forEach((round, i) => {
      const playing = round.flatMap((p) => [p.home, p.away]);
      expect(new Set(playing).size).toBe(playing.length);
      expect(round.every((p) => p.round === i + 1 && p.leg === 1 && p.home !== p.away)).toBe(true);
      expect(round).toHaveLength(Math.floor(n / 2));
      expect(rr.byes[i]).toHaveLength(n % 2);
      for (const t of rr.byes[i]!) {
        expect(playing).not.toContain(t);
        byeCount.set(t, (byeCount.get(t) ?? 0) + 1);
      }
    });
    if (n % 2 === 1) for (const t of teams) expect(byeCount.get(t)).toBe(1);
  });

  it('single: home and away differ by at most one for every team', () => {
    const rr = roundRobin(teams, { legs: 1 });
    for (const t of teams) {
      const home = rr.rounds.flat().filter((p) => p.home === t).length;
      const away = rr.rounds.flat().filter((p) => p.away === t).length;
      expect(home + away).toBe(n - 1);
      expect(Math.abs(home - away)).toBeLessThanOrEqual(1);
    }
  });

  it('double: every pair twice, second leg mirrors home and away, numbering continues', () => {
    const rr = roundRobin(teams, { legs: 2 });
    expect(rr.rounds).toHaveLength(2 * (m - 1));
    const all = rr.rounds.flat();
    expect(all).toHaveLength(n * (n - 1));
    expect(new Set(all.map((p) => p.key)).size).toBe(all.length);
    for (const first of all.filter((p) => p.leg === 1)) {
      const second = all.find((p) => p.key === `L2:${first.key.slice(3)}`)!;
      expect(second).toBeDefined();
      expect([second.home, second.away]).toEqual([first.away, first.home]);
      expect(second.round).toBe(first.round + (m - 1));
    }
    for (const t of teams) expect(all.filter((p) => p.home === t).length).toBe(n - 1);
  });

  it('is deterministic in the order of the teams', () => {
    expect(roundRobin(teams, { legs: 1 })).toEqual(roundRobin(teams.slice(), { legs: 1 }));
  });
});

describe('roundRobin refuses bad input', () => {
  it('needs two teams and unique ids', () => {
    expect(refuses(() => roundRobin(['T01'], { legs: 1 }))).toBe(true);
    expect(refuses(() => roundRobin(['T01', 'T01'], { legs: 1 }))).toBe(true);
  });
});
