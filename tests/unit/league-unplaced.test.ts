// L-017 (RAIN-03): the reason given for a displaced game with no makeup slot.
import { describe, expect, it } from 'vitest';
import { whyUnplaced } from '@/lib/league/unplaced';
import { DEFAULT_RULES, type ScheduleInput } from '@/lib/league/types';

const slot = (day: string, start = '18:00') => ({ id: `${day}|${start}|F1`, day, start, field: 'F1' });
const input: ScheduleInput = {
  games: [
    { key: 'L1:A~B', round: 1, leg: 1, home: 'A', away: 'B' },
    { key: 'L1:A~C', round: 2, leg: 1, home: 'A', away: 'C' },
  ],
  slots: [slot('2027-04-06'), slot('2027-04-06', '19:30'), slot('2027-04-08')],
  blackouts: [{ team: 'B', day: '2027-04-08' }],
  rules: DEFAULT_RULES,
};

describe('whyUnplaced', () => {
  it('counts the free slots and names what rules each one out', () => {
    // A~C holds Apr 6 18:00. For A~B: Apr 6 19:30 gives A a second game that day; Apr 8 is B's blackout.
    expect(whyUnplaced(input, { 'L1:A~C': '2027-04-06|18:00|F1' }, 'L1:A~B')).toBe(
      'None of the 2 free slots is legal: 1 on a day one of the teams is blacked out, 1 on a day one of the teams already plays. Add a makeup slot.',
    );
  });

  it('says so when no slot is free at all', () => {
    expect(whyUnplaced({ ...input, slots: [slot('2027-04-06')] }, { 'L1:A~C': '2027-04-06|18:00|F1' }, 'L1:A~B')).toBe('No free slot is left. Add a makeup slot.');
  });
});
