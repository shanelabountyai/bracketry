// PENDING in the starter: rename to .test.ts when the item starts (L-005). Spec: docs/prds/01-generator-spec.md §4, where every number below is worked by hand.
import { describe, expect, it } from 'vitest';
import { scoreSchedule } from '@/lib/league/schedule';
import { isPublishable, type Slot } from '@/lib/league/types';
import { game, input, lazy, makeSlots } from './league-fixtures';

// Tue 2027-04-06, Wed 04-07, Thu 04-08, then Tue 04-27. Two starts, two fields: 16 slots.
const slots: Slot[] = [
  ...makeSlots({ first: '2027-04-06', days: 3, weekdays: [2, 3, 4], starts: ['18:00', '19:30'], fields: ['F1', 'F2'] }),
  ...makeSlots({ first: '2027-04-27', days: 1, weekdays: [2], starts: ['18:00', '19:30'], fields: ['F1', 'F2'] }),
];
const games = [game(1, 'A', 'B'), game(1, 'C', 'D'), game(2, 'A', 'C'), game(2, 'B', 'D'), game(3, 'A', 'D'), game(3, 'B', 'C')];
const count = (vs: { code: string; cost: number }[], code: string) => vs.filter((v) => v.code === code).reduce((n, v) => n + v.cost, 0);

describe('scoreSchedule: the deliberately bad schedule (spec 01 §4.3)', () => {
  const bad = {
    'L1:A~B': '2027-04-06|18:00|F1',
    'L1:C~D': '2027-04-06|18:00|F1', // same slot as A~B
    'L1:A~C': '2027-04-06|18:00|F2', // A and C each in two places at once
    'L1:B~D': '2027-04-07|18:00|F1', // B and D played yesterday
    'L1:A~D': '2027-04-08|18:00|F1', // D is blacked out, and played yesterday
    // L1:B~C is not placed
  };
  const scored = lazy(() => scoreSchedule(input(games, slots, { blackouts: [{ team: 'D', day: '2027-04-08' }] }), bad));

  it('counts each hard violation', () => {
    const report = scored();
    expect(count(report.hard, 'SLOT_DOUBLE_BOOKED')).toBe(1);
    expect(count(report.hard, 'TEAM_SAME_TIME')).toBe(2); // A and C
    expect(count(report.hard, 'TEAM_DAY_LIMIT')).toBe(2); // A and C
    expect(count(report.hard, 'BLACKOUT')).toBe(1); // D
    expect(report.hardCount).toBe(6);
  });
  it('lists the unplaced game and is not publishable', () => {
    const report = scored();
    expect(report.unplaced).toEqual(['L1:B~C']);
    expect(isPublishable(report)).toBe(false);
  });
  it('prices the soft violations', () => {
    const report = scored();
    expect(count(report.soft, 'REST')).toBe(30); // B once, D twice, weight 10
    expect(count(report.soft, 'LONG_GAP')).toBe(0);
    expect(count(report.soft, 'SLOT_EQUITY')).toBe(0); // 18:00 → A3 B2 C2 D3, spread 1
    expect(count(report.soft, 'FIELD_EQUITY')).toBe(1); // F1 → A2 B2 C1 D3, spread 2
    expect(report.softCost).toBe(31);
  });
  it('explains every violation in plain language', () => {
    const report = scored();
    expect(report.hard.length + report.soft.length).toBeGreaterThan(0);
    for (const v of [...report.hard, ...report.soft]) expect(v.detail.length).toBeGreaterThan(10);
  });
});

describe('scoreSchedule: one rule at a time', () => {
  it('a clean schedule scores zero and is publishable', () => {
    const r = scoreSchedule(input([game(1, 'A', 'B'), game(1, 'C', 'D')], slots), {
      'L1:A~B': '2027-04-06|18:00|F1',
      'L1:C~D': '2027-04-06|18:00|F2',
    });
    expect([r.hardCount, r.softCost, r.unplaced]).toEqual([0, 0, []]);
    expect(isPublishable(r)).toBe(true);
  });
  it('PIN_MOVED: a pinned game somewhere else', () => {
    const r = scoreSchedule(input([game(1, 'A', 'B')], slots, { pinned: { 'L1:A~B': '2027-04-27|19:30|F2' } }), { 'L1:A~B': '2027-04-06|18:00|F1' });
    expect(count(r.hard, 'PIN_MOVED')).toBe(1);
    expect(r.hardCount).toBe(1);
  });
  it('UNKNOWN_SLOT: a slot id that is not in the inventory is hard, not unplaced', () => {
    const r = scoreSchedule(input([game(1, 'A', 'B')], slots), { 'L1:A~B': 'nope' });
    expect(count(r.hard, 'UNKNOWN_SLOT')).toBe(1);
    expect(r.unplaced).toEqual([]);
  });
  it('LONG_GAP: 21 days between a team’s games', () => {
    const r = scoreSchedule(input([game(1, 'A', 'B'), game(2, 'A', 'C')], slots), {
      'L1:A~B': '2027-04-06|18:00|F1',
      'L1:A~C': '2027-04-27|18:00|F1',
    });
    expect(count(r.soft, 'LONG_GAP')).toBe(3); // team A only
    expect(r.softCost).toBe(3);
  });
  it('REMATCH: both legs two days apart', () => {
    const r = scoreSchedule(input([game(1, 'A', 'B', 1), game(2, 'B', 'A', 2)], slots), {
      'L1:A~B': '2027-04-06|18:00|F1',
      'L2:A~B': '2027-04-08|18:00|F1',
    });
    expect(count(r.soft, 'REMATCH')).toBe(5);
    expect(count(r.soft, 'REST')).toBe(0); // 2 days is not fewer than the minimum of 2
    expect(r.softCost).toBe(5);
  });
  it('doubleheaders: two games in a day pass when the limit is 2, and same-day is not a REST violation', () => {
    const base = input([game(1, 'A', 'B'), game(2, 'A', 'C')], slots);
    const r = scoreSchedule({ ...base, rules: { ...base.rules, maxGamesPerTeamPerDay: 2 } }, {
      'L1:A~B': '2027-04-06|18:00|F1',
      'L1:A~C': '2027-04-06|19:30|F1',
    });
    expect([r.hardCount, count(r.soft, 'REST')]).toEqual([0, 0]);
  });
  it('equity is measured inside a division, never across', () => {
    const x = { ...game(1, 'A', 'B'), division: 'X' };
    const y = [game(1, 'C', 'D'), game(2, 'C', 'E'), game(3, 'D', 'E')].map((g) => ({ ...g, division: 'Y' }));
    const wide = makeSlots({ first: '2027-04-06', days: 14, weekdays: [2, 4], starts: ['18:00', '19:30'], fields: ['F1', 'F2'] });
    const r = scoreSchedule(input([x, ...y], wide), {
      'L1:A~B': '2027-04-06|18:00|F1',
      'L1:C~D': '2027-04-06|19:30|F1',
      'L1:C~E': '2027-04-08|19:30|F1',
      'L1:D~E': '2027-04-13|19:30|F1',
    });
    expect(r.softCost).toBe(0); // undivided, 19:30 would read A0 against C2
  });
});
