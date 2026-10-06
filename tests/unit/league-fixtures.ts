// Shared fixtures for the league suites. Not a test file.
import { addDays, weekday } from '@/lib/league/days';
import { DEFAULT_RULES, type Game, type GameResult, type Rules, type ScheduleInput, type Slot, type TeamId } from '@/lib/league/types';

export const teamIds = (n: number): TeamId[] => Array.from({ length: n }, (_, i) => `T${String(i + 1).padStart(2, '0')}`);

/** Every (day, start, field) in the window that falls on one of `weekdays` (0 = Sunday). Id: `2027-04-06|18:00|F1`. */
export function makeSlots(o: { first: string; days: number; weekdays: number[]; starts: string[]; fields: string[] }): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < o.days; i++) {
    const day = addDays(o.first, i);
    if (!o.weekdays.includes(weekday(day))) continue;
    for (const start of o.starts) for (const field of o.fields) out.push({ id: `${day}|${start}|${field}`, day, start, field });
  }
  return out;
}

export const rules = (over: Partial<Rules> = {}): Rules => ({ ...DEFAULT_RULES, ...over, weights: { ...DEFAULT_RULES.weights, ...(over.weights ?? {}) } });

/** A hand-built game, for suites that must not depend on roundRobin(). */
export const game = (round: number, home: TeamId, away: TeamId, leg: 1 | 2 = 1): Game => {
  const [a, b] = home < away ? [home, away] : [away, home];
  return { key: `L${leg}:${a}~${b}`, round, leg, home, away };
};

/** The capstone league: Tuesday and Thursday evenings from Tue 2027-04-06, two fields, two start times. */
export const TUE = 2;
export const THU = 4;
export const capstoneSlots = (weeks: number): Slot[] =>
  makeSlots({ first: '2027-04-06', days: weeks * 7, weekdays: [TUE, THU], starts: ['18:00', '19:30'], fields: ['F1', 'F2'] });

export const input = (games: Game[], slots: Slot[], over: Partial<ScheduleInput> = {}): ScheduleInput => ({
  games,
  slots,
  blackouts: [],
  rules: rules(),
  ...over,
});

/** `r('A', 5, 'B', 1)` = A at home beat B 5–1. */
export const r = (home: TeamId, homeRuns: number, away: TeamId, awayRuns: number): GameResult => ({ home, away, homeRuns, awayRuns });

/** Run `fn` on first use, not when the file loads, so an unbuilt function fails its own tests one by one. */
export function lazy<T>(fn: () => T): () => T {
  let done = false;
  let value: T;
  return () => {
    if (!done) {
      value = fn();
      done = true;
    }
    return value!;
  };
}

/** True when `fn` throws a real refusal. A NotImplementedError does not count, so a stub cannot pass. */
export function refuses(fn: () => unknown): boolean {
  try {
    fn();
  } catch (e) {
    return !(e instanceof Error && e.name === 'NotImplementedError');
  }
  return false;
}
