// PENDING in the starter: rename to .test.ts when the item starts (L-007 reschedule). Spec: docs/prds/01-generator-spec.md §7.
// Split out of league-generate at L-006 so that suite can go green while reschedule is still a stub (D-20).
import { describe, expect, it } from 'vitest';
import { roundRobin } from '@/lib/league/round-robin';
import { generateSchedule, reschedule, scoreSchedule } from '@/lib/league/schedule';
import { type Assignment, type ScheduleInput } from '@/lib/league/types';
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

describe('reschedule (rainout)', () => {
  const rainDay = '2027-04-22';

  it('moves only the rained-out games; every other game keeps its slot', () => {
    const before = capstone();
    const g = generateSchedule(before, { seed: 2027 });
    const removedSlotIds = before.slots.filter((s) => s.day === rainDay).map((s) => s.id);
    const makeup = makeSlots({ first: '2027-05-29', days: 1, weekdays: [6], starts: ['09:00', '10:30'], fields: ['F1', 'F2'] });
    const after: ScheduleInput = { ...before, slots: [...before.slots.filter((s) => s.day !== rainDay), ...makeup] };
    const displaced = Object.keys(g.assignment).filter((k) => removedSlotIds.includes(g.assignment[k]!));

    const out = reschedule({ input: after, current: g.assignment, removedSlotIds, seed: 1 });

    for (const key of Object.keys(g.assignment)) if (!displaced.includes(key)) expect(out.assignment[key]).toBe(g.assignment[key]);
    expect(out.moved.map((m) => m.game).sort()).toEqual(displaced.filter((k) => !out.unplaced.includes(k)).sort());
    expect(out.moved.length + out.unplaced.length).toBe(displaced.length);
    for (const m of out.moved) {
      expect(removedSlotIds).toContain(m.from);
      expect(removedSlotIds).not.toContain(m.to);
      expect(out.assignment[m.game]).toBe(m.to);
    }
    expect(out.report.hardCount).toBe(0);
    expect(out.report).toEqual(scoreSchedule(after, out.assignment));
  });

  it('with no legal makeup slot a game is left unplaced, never double-booked', () => {
    const games = [game(1, 'A', 'B'), game(1, 'C', 'D'), game(2, 'A', 'C'), game(2, 'B', 'D')];
    const slots = makeSlots({ first: '2027-04-06', days: 3, weekdays: [2, 4], starts: ['18:00'], fields: ['F1', 'F2'] }); // 4 slots, all used
    const current: Assignment = {
      'L1:A~B': '2027-04-06|18:00|F1',
      'L1:C~D': '2027-04-06|18:00|F2',
      'L1:A~C': '2027-04-08|18:00|F1',
      'L1:B~D': '2027-04-08|18:00|F2',
    };
    const removedSlotIds = ['2027-04-08|18:00|F1', '2027-04-08|18:00|F2'];
    const out = reschedule({ input: input(games, slots.filter((s) => s.day !== '2027-04-08')), current, removedSlotIds, seed: 1 });
    expect(out.unplaced).toEqual(['L1:A~C', 'L1:B~D']);
    expect(out.moved).toEqual([]);
    expect(out.report.hardCount).toBe(0);
    expect(out.assignment).toEqual({ 'L1:A~B': '2027-04-06|18:00|F1', 'L1:C~D': '2027-04-06|18:00|F2' });
  });
});
