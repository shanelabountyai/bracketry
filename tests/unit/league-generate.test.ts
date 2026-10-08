// L-006 generate + repair. Spec: docs/prds/01-generator-spec.md §5–§6. The reschedule tests are in league-reschedule.test.ts.
// These are property tests: they hold for ANY correct implementation, so they do not pin one search order.
import { describe, expect, it } from 'vitest';
import { fingerprint } from '@/lib/league/fingerprint';
import { roundRobin } from '@/lib/league/round-robin';
import { generateSchedule, repair, scoreSchedule } from '@/lib/league/schedule';
import { isPublishable, type Assignment, type ScheduleInput } from '@/lib/league/types';
import { capstoneSlots, game, input, makeSlots, rules, teamIds } from './league-fixtures';

const league = (n: number, weeks: number, over: Partial<ScheduleInput> = {}): ScheduleInput =>
  input(roundRobin(teamIds(n), { legs: 1 }).rounds.flat(), capstoneSlots(weeks), { rules: rules({ minRestDays: 3 }), ...over });

/** The capstone: 9 teams, 2 fields, 7 weeks of Tuesdays and Thursdays, three blackout dates. */
const capstone = () =>
  league(9, 7, {
    blackouts: [
      { team: 'T03', day: '2027-04-13' },
      { team: 'T03', day: '2027-04-15' },
      { team: 'T07', day: '2027-04-20' },
    ],
  });

function expectComplete(inp: ScheduleInput, a: Assignment) {
  expect(Object.keys(a).sort()).toEqual(inp.games.map((g) => g.key).sort());
  expect(new Set(Object.values(a)).size).toBe(inp.games.length);
}

describe('generateSchedule', () => {
  it('capstone: every game placed once, no hard violation, publishable', () => {
    const inp = capstone();
    const g = generateSchedule(inp, { seed: 2027 });
    expectComplete(inp, g.assignment);
    expect(g.report.hardCount).toBe(0);
    expect(isPublishable(g.report)).toBe(true);
  });

  it('the report is the scoring function’s answer, not a second opinion', () => {
    const inp = capstone();
    const g = generateSchedule(inp, { seed: 2027 });
    expect(g.report).toEqual(scoreSchedule(inp, g.assignment));
    expect(g.fingerprint).toBe(fingerprint(g.assignment));
  });

  it('repair never makes the draft worse, and reports its work', () => {
    const g = generateSchedule(capstone(), { seed: 2027, maxIterations: 3000 });
    expect(g.report.softCost).toBeLessThanOrEqual(g.before.softCost);
    expect(g.iterations).toBeLessThanOrEqual(3000);
    expect(g.accepted).toBeLessThanOrEqual(g.iterations);
    expect(g.seed).toBe(2027);
  });

  it('capstone quality: at or above the provable floor, and within 30% of it', () => {
    // Spec 01 §6.4. Eight games in seven weeks of Tue/Thu forces every team into at least one two-game week,
    // and T03 (out for a whole week) into two: 10 REST violations × weight 10 = 100, whatever the search does.
    const g = generateSchedule(capstone(), { seed: 2027 });
    expect(g.report.softCost).toBeGreaterThanOrEqual(100);
    expect(g.report.softCost).toBeLessThanOrEqual(130);
    expect(g.before.softCost).toBeGreaterThan(g.report.softCost);
  });

  it('same input and seed → the same schedule, byte for byte', () => {
    const a = generateSchedule(capstone(), { seed: 2027 });
    const b = generateSchedule(capstone(), { seed: 2027 });
    expect(b.assignment).toEqual(a.assignment);
    expect(b.fingerprint).toBe(a.fingerprint);
    expect(b.iterations).toBe(a.iterations);
  });

  it.each([
    [6, 6],
    [7, 6],
    [8, 8],
    [12, 10],
  ])('%i teams over %i weeks is publishable', (n, weeks) => {
    const inp = league(n, weeks);
    const g = generateSchedule(inp, { seed: 1 });
    expectComplete(inp, g.assignment);
    expect(isPublishable(g.report)).toBe(true);
  });

  it('two divisions share the fields and are scheduled together', () => {
    const east = roundRobin(teamIds(9), { legs: 1 }).rounds.flat().map((g) => ({ ...g, division: 'East' }));
    const westTeams = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'];
    const west = roundRobin(westTeams, { legs: 1 }).rounds.flat().map((g) => ({ ...g, division: 'West' }));
    const inp = input([...east, ...west], capstoneSlots(8), { rules: rules({ minRestDays: 3 }) }); // 51 games, 64 slots
    const g = generateSchedule(inp, { seed: 11 });
    expectComplete(inp, g.assignment);
    expect(isPublishable(g.report)).toBe(true);
  });

  it('a pinned game stays put and the rest is built around it', () => {
    const pinned = { 'L1:T01~T02': '2027-05-20|19:30|F2' };
    const inp = league(9, 7, { pinned });
    const g = generateSchedule(inp, { seed: 5 });
    expect(g.assignment['L1:T01~T02']).toBe('2027-05-20|19:30|F2');
    expect(isPublishable(g.report)).toBe(true);
  });

  it('an impossible season comes back unpublishable, with games unplaced and nothing placed illegally', () => {
    const g = generateSchedule(league(9, 4), { seed: 1 }); // 36 games, 32 slots
    expect(g.report.hardCount).toBe(0);
    expect(g.report.unplaced.length).toBeGreaterThanOrEqual(4);
    expect(isPublishable(g.report)).toBe(false);
  });
});

describe('repair', () => {
  it('drives a deliberately bad schedule to zero hard violations and a lower soft cost', () => {
    const games = [game(1, 'A', 'B'), game(1, 'C', 'D'), game(2, 'A', 'C'), game(2, 'B', 'D'), game(3, 'A', 'D'), game(3, 'B', 'C')];
    const slots = makeSlots({ first: '2027-04-06', days: 21, weekdays: [2, 3, 4], starts: ['18:00', '19:30'], fields: ['F1', 'F2'] });
    const inp = input(games, slots, { blackouts: [{ team: 'D', day: '2027-04-08' }] });
    const bad: Assignment = {
      'L1:A~B': '2027-04-06|18:00|F1',
      'L1:C~D': '2027-04-06|18:00|F1',
      'L1:A~C': '2027-04-06|18:00|F2',
      'L1:B~D': '2027-04-07|18:00|F1',
      'L1:A~D': '2027-04-08|18:00|F1',
    };
    const out = repair(inp, bad, { seed: 9 });
    expect(out.before.hardCount).toBe(6);
    expect(out.before.unplaced).toEqual(['L1:B~C']);
    expect(out.report.hardCount).toBe(0);
    expect(out.report.unplaced).toEqual([]);
    expect(out.report.softCost).toBeLessThan(out.before.softCost);
    expect(bad['L1:B~C']).toBeUndefined(); // the input assignment is not mutated
  });
});

describe('determinism beyond the seed (D-3)', () => {
  it('the order of the input arrays does not change the schedule', () => {
    const inp = capstone();
    const reversed: ScheduleInput = { ...inp, games: [...inp.games].reverse(), slots: [...inp.slots].reverse(), blackouts: [...inp.blackouts].reverse() };
    expect(generateSchedule(reversed, { seed: 2027 }).fingerprint).toBe(generateSchedule(inp, { seed: 2027 }).fingerprint);
  });
});
