import { describe, expect, it } from 'vitest';
import { buildInput, capRefusal, inputHash, slotId } from '@/lib/league/build-input';

const div = (id: string, n: number, legs = 1) => ({ id, name: id, legs, teamIds: Array.from({ length: n }, (_, i) => `${id}-t${String(i).padStart(2, '0')}`) });
const rows = (divisions = [div('d1', 4)]) => ({
  divisions,
  slots: [{ day: '2026-10-06', start: '18:00', fieldId: 'f1' }, { day: '2026-10-13', start: '18:00', fieldId: 'f1' }],
  blackouts: [{ teamId: 'd1-t00', day: '2026-10-13' }],
  rules: {},
});

describe('buildInput', () => {
  it('builds a round robin per division with D-24 slot ids and default rules', () => {
    const i = buildInput(rows());
    expect(i.games).toHaveLength(6);
    expect(i.games.every((g) => g.division === 'd1')).toBe(true);
    expect(i.slots.map((s) => s.id)).toEqual(['2026-10-06|18:00|f1', '2026-10-13|18:00|f1']);
    expect(slotId(rows().slots[0]!)).toBe(i.slots[0]!.id);
    expect(i.rules.maxGamesPerTeamPerDay).toBe(1);
  });

  it('merges partial stored rules over the defaults', () => {
    expect(buildInput({ ...rows(), rules: { minRestDays: 5, weights: { rest: 1 } as never } }).rules).toMatchObject({ minRestDays: 5, maxGapDays: 14, weights: { rest: 1, rematch: 5 } });
  });
});

describe('inputHash', () => {
  it('is the same for the same league in any row order, and changes with any input', () => {
    const a = rows();
    const b = { ...rows(), slots: [...rows().slots].reverse() };
    expect(inputHash(buildInput(a))).toBe(inputHash(buildInput(b)));
    expect(inputHash(buildInput({ ...a, blackouts: [] }))).not.toBe(inputHash(buildInput(a)));
    expect(inputHash(buildInput({ ...a, rules: { minRestDays: 3 } }))).not.toBe(inputHash(buildInput(a)));
  });
});

describe('capRefusal (D-17)', () => {
  it('allows 16 teams, refuses 17 and states the limit', () => {
    expect(capRefusal([div('d1', 16)], 120)).toBeNull();
    expect(capRefusal([div('d1', 17)], 136)).toBe('d1 has 17 teams; generation is limited to 16 per division.');
  });
  it('refuses more than 200 games', () => {
    expect(capRefusal([div('d1', 16, 2)], 240)).toBe('This season needs 240 games; generation is limited to 200.');
    expect(capRefusal([div('d1', 16, 2)], 200)).toBeNull();
  });
});
