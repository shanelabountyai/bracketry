// L-020 quality table and floor. Spec: docs/prds/01-generator-spec.md §6.4 (the floor of 100 is worked there by hand).
import { describe, expect, it } from 'vitest';
import { restFloor, scheduleQuality } from '@/lib/league/quality';
import { roundRobin } from '@/lib/league/round-robin';
import { generateSchedule, scoreSchedule } from '@/lib/league/schedule';
import { capstoneSlots, game, input, rules, teamIds } from './league-fixtures';

const capstone = () =>
  input(roundRobin(teamIds(9), { legs: 1 }).rounds.flat(), capstoneSlots(7), {
    rules: rules({ minRestDays: 3 }),
    blackouts: [
      { team: 'T03', day: '2027-04-13' },
      { team: 'T03', day: '2027-04-15' },
      { team: 'T07', day: '2027-04-20' },
    ],
  });

describe('restFloor', () => {
  it('capstone: 8 teams forced once, T03 twice → 10 × 10 = 100 (spec §6.4)', () => {
    const f = restFloor(capstone());
    expect(f.units).toBe(10);
    expect(f.cost).toBe(100);
    expect(f.perTeam.find((t) => t.team === 'T03')).toEqual({ team: 'T03', games: 8, runs: 6, units: 2 });
    expect(f.perTeam.find((t) => t.team === 'T07')).toEqual({ team: 'T07', games: 8, runs: 7, units: 1 });
  });

  it('counts nothing when the calendar leaves room, or the rule is off', () => {
    // 8 games, 8 weeks: one game a week is possible.
    expect(restFloor({ ...capstone(), slots: capstoneSlots(8), blackouts: [] }).cost).toBe(0);
    expect(restFloor({ ...capstone(), rules: rules({ minRestDays: 3, weights: { ...rules().weights, rest: 0 } }) }).cost).toBe(0);
    // Default minRestDays 2: Tuesday and Thursday are 2 days apart, so nothing is forced.
    expect(restFloor({ ...capstone(), rules: rules() }).cost).toBe(0);
  });

  it('is never above what a generated schedule scores', () => {
    for (const seed of [1, 2, 2027]) {
      const inp = capstone();
      const g = generateSchedule(inp, { seed, maxIterations: 500 });
      expect(g.report.softCost).toBeGreaterThanOrEqual(restFloor(inp).cost);
    }
  });
});

describe('scheduleQuality', () => {
  // Two weeks of Tue/Thu. T01: Tue Apr 6 18:00 F1 (home), Thu Apr 8 19:30 F2 (away). T03's only game is in week 2.
  const inp = input([game(1, 'T01', 'T02'), game(2, 'T03', 'T01'), game(3, 'T02', 'T03')], capstoneSlots(2), { rules: rules({ minRestDays: 3 }) });
  const a = { 'L1:T01~T02': '2027-04-06|18:00|F1', 'L1:T01~T03': '2027-04-08|19:30|F2' };
  const q = scheduleQuality(inp, a);

  it('reports the score scoreSchedule gives, unchanged (D-4)', () => {
    expect(q.report).toEqual(scoreSchedule(inp, a));
    expect(q.report.unplaced).toEqual(['L1:T02~T03']);
  });

  it('counts each team’s games, sides, start times, fields, rest and byes', () => {
    expect(q.starts).toEqual(['18:00', '19:30']);
    expect(q.fields).toEqual(['F1', 'F2']);
    expect(q.teams.map((t) => t.team)).toEqual(['T01', 'T02', 'T03']);
    expect(q.teams[0]).toEqual({
      team: 'T01', division: '', games: 2, home: 1, away: 1,
      byStart: { '18:00': 1, '19:30': 1 }, byField: { F1: 1, F2: 1 },
      shortestRest: 2, longestRest: 2, byes: 1, flags: 1,
    });
    expect(q.teams[1]).toMatchObject({ team: 'T02', games: 1, home: 0, away: 1, shortestRest: null, longestRest: null, byes: 1, flags: 0 });
    expect(q.teams[2]).toMatchObject({ team: 'T03', games: 1, home: 1, away: 0, byStart: { '18:00': 0, '19:30': 1 }, byes: 1 });
  });
});
