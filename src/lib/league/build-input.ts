// Rows → engine input (L-013). Pure: callers load rows, this builds what the generator takes.
import { createHash } from 'node:crypto';
import { roundRobin } from './round-robin';
import { DEFAULT_RULES, type Game, type Rules, type ScheduleInput, type Slot } from './types';

/** D-17. Generation runs synchronously in a server action, so it is bounded. */
export const CAPS = { teamsPerDivision: 16, gamesPerSeason: 200, maxIterations: 10_000 } as const;

export interface SeasonRows {
  divisions: { id: string; name: string; legs: number; teamIds: string[] }[];
  /** Slots that can take a game: open and makeup, never closed. */
  slots: { day: string; start: string; fieldId: string }[];
  blackouts: { teamId: string; day: string }[];
  rules: Partial<Rules>;
  /** game key → slot id (D-24), from the Pin rows. */
  pinned?: Record<string, string>;
  /** DBL-01. Rounds of crossover games between every two divisions. Default 0. */
  crossoverRounds?: number;
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Crossover pairings between two divisions (D-41, spec 01 §9), as [home, away, round index from 0].
 * In a round every team of the smaller division plays one team of the larger. The larger division is a circle
 * and each round takes the next block of it, so its teams' game counts never differ by more than one; after the
 * circle closes the block shifts by one, so no pair meets twice. It stops once every opponent has been met.
 */
export function crossover(x: readonly string[], y: readonly string[], rounds: number): [string, string, number][] {
  const [small, big] = x.length <= y.length ? [x, y] : [y, x];
  if (small.length === 0) return [];
  const period = big.length / gcd(small.length, big.length);
  const out: [string, string, number][] = [];
  for (let r = 0; r < Math.min(rounds, big.length); r++) {
    const offset = r * small.length + Math.floor(r / period);
    for (let j = 0; j < small.length; j++) {
      const [s, b] = [small[j]!, big[(j + offset) % big.length]!];
      out.push((j + r) % 2 === 0 ? [s, b, r] : [b, s, r]);
    }
  }
  return out;
}

/** D-24: the engine's slot id is the slot's calendar identity, never the row's UUID. */
export const slotId = (s: { day: string; start: string; fieldId: string }) => `${s.day}|${s.start}|${s.fieldId}`;

/** The first cap the rows break, stated with its limit, or null. */
export function capRefusal(divisions: SeasonRows['divisions'], games: number): string | null {
  for (const d of divisions) {
    if (d.teamIds.length > CAPS.teamsPerDivision) return `${d.name} has ${d.teamIds.length} teams; generation is limited to ${CAPS.teamsPerDivision} per division.`;
  }
  if (games > CAPS.gamesPerSeason) return `This season needs ${games} games; generation is limited to ${CAPS.gamesPerSeason}.`;
  return null;
}

export function buildInput(rows: SeasonRows): ScheduleInput {
  const games: Game[] = [];
  const divisions = [...rows.divisions].sort((a, b) => (a.id < b.id ? -1 : 1)).map((d) => ({ ...d, teamIds: [...d.teamIds].sort() }));
  for (const d of divisions) {
    if (d.teamIds.length < 2) continue;
    const rr = roundRobin(d.teamIds, { legs: d.legs === 2 ? 2 : 1 });
    for (const round of rr.rounds) for (const p of round) games.push({ key: p.key, round: p.round, leg: p.leg, home: p.home, away: p.away, division: d.id });
  }
  const n = rows.crossoverRounds ?? 0;
  if (n > 0) {
    // The draft fills slots in round order, so crossover rounds are numbered evenly through the division rounds.
    const last = Math.max(1, ...games.map((g) => g.round));
    const divisionOf = new Map(divisions.flatMap((d) => d.teamIds.map((t) => [t, d.id] as const)));
    for (let i = 0; i < divisions.length; i++) {
      for (let j = i + 1; j < divisions.length; j++) {
        for (const [home, away, r] of crossover(divisions[i]!.teamIds, divisions[j]!.teamIds, n)) {
          const [a, b] = home < away ? [home, away] : [away, home];
          games.push({ key: `X:${a}~${b}`, round: Math.max(1, Math.round(((r + 1) * last) / (n + 1))), leg: 1, home, away, division: divisionOf.get(home)!, awayDivision: divisionOf.get(away)! });
        }
      }
    }
  }
  const slots: Slot[] = rows.slots.map((s) => ({ id: slotId(s), day: s.day, start: s.start, field: s.fieldId }));
  return {
    games,
    slots,
    blackouts: rows.blackouts.map((b) => ({ team: b.teamId, day: b.day })),
    rules: { ...DEFAULT_RULES, ...rows.rules, weights: { ...DEFAULT_RULES.weights, ...rows.rules.weights } },
    ...(rows.pinned && Object.keys(rows.pinned).length ? { pinned: rows.pinned } : {}),
  };
}

/** sha256 of the input in a fixed order and key order, so the same league always hashes the same (D-3). */
export function inputHash(input: ScheduleInput): string {
  const { rules: r } = input;
  const canon = {
    games: [...input.games].sort((a, b) => (a.key < b.key ? -1 : 1)).map((g) => [g.key, g.round, g.home, g.away, g.division ?? '', ...(g.awayDivision ? [g.awayDivision] : [])]),
    slots: input.slots.map((s) => [s.id, s.day, s.start, s.field]).sort((a, b) => (a[0]! < b[0]! ? -1 : 1)),
    blackouts: input.blackouts.map((b) => `${b.team}|${b.day}`).sort(),
    rules: [r.maxGamesPerTeamPerDay, r.minRestDays, r.maxGapDays, r.minRematchDays, r.weights.rest, r.weights.longGap, r.weights.slotEquity, r.weights.fieldEquity, r.weights.rematch],
    pinned: Object.entries(input.pinned ?? {}).sort(),
  };
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}
