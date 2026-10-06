// PENDING in the starter: rename to .test.ts when the item starts (L-004). Spec: docs/prds/01-generator-spec.md §3.
// Games are built by hand here so this suite does not depend on roundRobin().
import { describe, expect, it } from 'vitest';
import { checkFeasibility } from '@/lib/league/feasibility';
import type { Game } from '@/lib/league/types';
import { capstoneSlots, game, input, teamIds } from './league-fixtures';

const allPairs = (n: number): Game[] => {
  const t = teamIds(n);
  const out: Game[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) out.push(game(1, t[i]!, t[j]!));
  return out;
};

describe('checkFeasibility', () => {
  it('9 teams, 8 weeks: fits, with the arithmetic shown', () => {
    const f = checkFeasibility(input(allPairs(9), capstoneSlots(8)));
    expect(f.feasible).toBe(true);
    expect(f.gamesNeeded).toBe(36); // 9 × 8 / 2
    expect(f.slotsAvailable).toBe(64); // 16 game days × 4 slots
    expect(f.effectiveCapacity).toBe(64); // floor(9 / 2) = 4 games a day, same as the slots
    expect(f.shortfalls).toEqual([]);
    expect(f.perTeam).toHaveLength(9);
    expect(f.perTeam[0]).toEqual({ team: 'T01', gamesNeeded: 8, playableDays: 16, capacity: 16 });
  });

  it('9 teams, 4 weeks: four slots short, and says so', () => {
    const f = checkFeasibility(input(allPairs(9), capstoneSlots(4)));
    expect(f.feasible).toBe(false);
    expect(f.shortfalls.map((s) => [s.code, s.shortBy])).toEqual([
      ['SLOTS_SHORT', 4],
      ['DAILY_CAPACITY_SHORT', 4],
    ]);
    expect(f.shortfalls.every((s) => s.detail.length > 0)).toBe(true);
  });

  it('7 teams, 3 weeks: enough slots, not enough calendar', () => {
    // 21 games, 24 slots. But 7 teams fill at most 3 games a day: 6 days × 3 = 18.
    const f = checkFeasibility(input(allPairs(7), capstoneSlots(3)));
    expect(f.slotsAvailable).toBe(24);
    expect(f.effectiveCapacity).toBe(18);
    expect(f.feasible).toBe(false);
    expect(f.shortfalls.map((s) => [s.code, s.shortBy])).toEqual([['DAILY_CAPACITY_SHORT', 3]]);
  });

  it('a blackout can sink one team while the league as a whole fits', () => {
    // 6 teams, 3 weeks = 6 game days. T01 needs 5 games and is out on 2 of the days: 4 open days.
    const f = checkFeasibility(
      input(allPairs(6), capstoneSlots(3), {
        blackouts: [
          { team: 'T01', day: '2027-04-06' },
          { team: 'T01', day: '2027-04-08' },
        ],
      }),
    );
    expect(f.gamesNeeded).toBe(15);
    expect(f.effectiveCapacity).toBe(16); // 4 days × 3 games + 2 days × floor(5 / 2)
    expect(f.feasible).toBe(false);
    expect(f.shortfalls).toHaveLength(1);
    expect(f.shortfalls[0]).toMatchObject({ code: 'TEAM_DAYS_SHORT', team: 'T01', shortBy: 1 });
    expect(f.perTeam.find((p) => p.team === 'T01')).toEqual({ team: 'T01', gamesNeeded: 5, playableDays: 4, capacity: 4 });
  });

  it('doubleheaders raise the ceiling', () => {
    const base = input(allPairs(7), capstoneSlots(3));
    const f = checkFeasibility({ ...base, rules: { ...base.rules, maxGamesPerTeamPerDay: 2 } });
    expect(f.effectiveCapacity).toBe(24); // min(4 slots, floor(7 × 2 / 2)) = 4 a day × 6 days
    expect(f.feasible).toBe(true);
  });
});
