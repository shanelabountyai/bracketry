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

// D-41. Worked by hand in docs/prds/01-generator-spec.md §9.
describe('crossover games (DBL-01)', () => {
  const x = (divisions: ReturnType<typeof div>[], n: number) => buildInput({ ...rows(divisions), crossoverRounds: n }).games.filter((g) => g.key.startsWith('X:'));
  const small = [div('d1', 2), div('d2', 3)];
  it('pairs every team of the smaller division once a round, with no opponent twice and the host alternating', () => {
    expect(x(small, 3).map((g) => `${g.home}>${g.away}`)).toEqual([
      'd1-t00>d2-t00', 'd2-t01>d1-t01',
      'd2-t02>d1-t00', 'd1-t01>d2-t00',
      'd1-t00>d2-t01', 'd2-t02>d1-t01',
    ]);
  });
  it('keys the game by its two teams and names each side\'s own division', () => {
    expect(x(small, 1)).toEqual([
      { key: 'X:d1-t00~d2-t00', round: 2, leg: 1, home: 'd1-t00', away: 'd2-t00', division: 'd1', awayDivision: 'd2' },
      { key: 'X:d1-t01~d2-t01', round: 2, leg: 1, home: 'd2-t01', away: 'd1-t01', division: 'd2', awayDivision: 'd1' },
    ]);
  });
  it('stops when every opponent has been met, and 0 rounds changes nothing', () => {
    expect(x(small, 9)).toHaveLength(6);
    expect(x(small, 0)).toHaveLength(0);
    expect(inputHash(buildInput({ ...rows(small), crossoverRounds: 0 }))).toBe(inputHash(buildInput(rows(small))));
    expect(inputHash(buildInput({ ...rows(small), crossoverRounds: 1 }))).not.toBe(inputHash(buildInput(rows(small))));
  });
  it('the sample league (6 and 9 teams, 4 rounds): 4 different opponents each for the 6, and 2 or 3 games each for the 9', () => {
    const games = x([div('a', 6), div('b', 9)], 4);
    expect(games).toHaveLength(24);
    expect(new Set(games.map((g) => g.key)).size).toBe(24);
    const count = (prefix: string) => {
      const n = new Map<string, number>();
      for (const g of games) for (const t of [g.home, g.away]) if (t.startsWith(prefix)) n.set(t, (n.get(t) ?? 0) + 1);
      return [...n.values()].sort();
    };
    expect(count('a-')).toEqual([4, 4, 4, 4, 4, 4]);
    expect(count('b-')).toEqual([2, 2, 2, 3, 3, 3, 3, 3, 3]);
  });
  it('pairs every two divisions when there are three', () => {
    expect(x([div('d1', 2), div('d2', 2), div('d3', 2)], 1)).toHaveLength(6);
  });
});
