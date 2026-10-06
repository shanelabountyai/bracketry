// GREEN in the starter. These helpers ship implemented; this suite pins their behaviour.
import { describe, expect, it } from 'vitest';
import { addDays, dayDiff, dayNumber, weekday } from '@/lib/league/days';
import { fingerprint } from '@/lib/league/fingerprint';
import { mulberry32, shuffle } from '@/lib/league/prng';

describe('prng', () => {
  it('gives the same sequence for the same seed', () => {
    const g = mulberry32(42);
    expect([g(), g(), g()]).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
  });
  it('shuffles on a copy, deterministically', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(items, mulberry32(7))).toEqual([5, 7, 2, 3, 4, 6, 8, 1]);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe('days', () => {
  it('knows the weekday without the process timezone', () => {
    expect(weekday('2027-04-06')).toBe(2); // Tuesday
    expect(weekday('1970-01-01')).toBe(4); // Thursday
  });
  it('adds and subtracts across month and leap-year edges', () => {
    expect(addDays('2027-04-29', 5)).toBe('2027-05-04');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(dayDiff('2027-04-06', '2027-04-27')).toBe(21);
    expect(dayNumber('1970-01-02')).toBe(1);
  });
  it('refuses a day that does not exist', () => {
    expect(() => dayNumber('2027-02-30')).toThrow();
    expect(() => dayNumber('04/06/2027')).toThrow();
  });
});

describe('fingerprint', () => {
  it('ignores key order and changes when a game moves', () => {
    expect(fingerprint({ b: 's2', a: 's1' })).toBe('972d43d4aa4179d52c7b2927f6cb47ea8395e26b412493116f2b472d30aae26e');
    expect(fingerprint({ a: 's1', b: 's2' })).toBe(fingerprint({ b: 's2', a: 's1' }));
    expect(fingerprint({ a: 's1', b: 's3' })).not.toBe(fingerprint({ a: 's1', b: 's2' }));
  });
});
