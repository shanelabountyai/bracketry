import { describe, expect, it } from 'vitest';
import { resultsOrder } from '@/app/o/[org]/seasons/results-order';

const row = (id: string, day: string, start: string, field: string, scored = false) => ({ id, day, start, field, scored });

describe('resultsOrder (SCORE-10 to SCORE-12)', () => {
  const rows = [
    row('future', '2026-10-15', '18:00', 'North'),
    row('scored', '2026-10-12', '18:00', 'North', true),
    row('south-late', '2026-10-13', '19:30', 'South'),
    row('north-today', '2026-10-13', '18:00', 'North'),
    row('south-early', '2026-10-12', '18:00', 'South'),
  ];
  const { owed, rest } = resultsOrder(rows, '2026-10-13');

  it('puts played games with no score first, one group a field, in date and time order', () => {
    expect(owed.map(([field, rs]) => [field, rs.map((r) => r.id)])).toEqual([
      ['North', ['north-today']],
      ['South', ['south-early', 'south-late']],
    ]);
  });

  it('keeps scored and future games after them, in date order', () => {
    expect(rest.map((r) => r.id)).toEqual(['scored', 'future']);
  });

  it('owes nothing when no game has been played', () => {
    expect(resultsOrder(rows, '2026-10-11').owed).toEqual([]);
  });
});
