import { describe, expect, it } from 'vitest';
import { materializeSlots } from '@/lib/league/materialize';

describe('materializeSlots', () => {
  // 2026-10-05 is a Monday, so Tuesday is the 6th and 13th.
  it('emits one slot per matching weekday inside the window, ends inclusive', () => {
    const rows = materializeSlots([{ weekday: 2, start: '18:00', fieldId: 'f1' }], '2026-10-05', '2026-10-13');
    expect(rows.map((r) => r.day)).toEqual(['2026-10-06', '2026-10-13']);
  });
  it('sorts by day, start, field and handles two patterns on one day', () => {
    const rows = materializeSlots(
      [{ weekday: 2, start: '19:30', fieldId: 'f1' }, { weekday: 2, start: '18:00', fieldId: 'f2' }, { weekday: 2, start: '18:00', fieldId: 'f1' }],
      '2026-10-06', '2026-10-06',
    );
    expect(rows.map((r) => `${r.start}/${r.fieldId}`)).toEqual(['18:00/f1', '18:00/f2', '19:30/f1']);
  });
  it('is empty when no pattern weekday falls in the window', () => {
    expect(materializeSlots([{ weekday: 0, start: '10:00', fieldId: 'f1' }], '2026-10-06', '2026-10-10')).toEqual([]);
  });
});
