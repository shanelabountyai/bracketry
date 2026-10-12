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
  for (const d of [...rows.divisions].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (d.teamIds.length < 2) continue;
    const rr = roundRobin([...d.teamIds].sort(), { legs: d.legs === 2 ? 2 : 1 });
    for (const round of rr.rounds) for (const p of round) games.push({ key: p.key, round: p.round, leg: p.leg, home: p.home, away: p.away, division: d.id });
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
    games: [...input.games].sort((a, b) => (a.key < b.key ? -1 : 1)).map((g) => [g.key, g.round, g.home, g.away, g.division ?? '']),
    slots: input.slots.map((s) => [s.id, s.day, s.start, s.field]).sort((a, b) => (a[0]! < b[0]! ? -1 : 1)),
    blackouts: input.blackouts.map((b) => `${b.team}|${b.day}`).sort(),
    rules: [r.maxGamesPerTeamPerDay, r.minRestDays, r.maxGapDays, r.minRematchDays, r.weights.rest, r.weights.longGap, r.weights.slotEquity, r.weights.fieldEquity, r.weights.rematch],
    pinned: Object.entries(input.pinned ?? {}).sort(),
  };
  return createHash('sha256').update(JSON.stringify(canon)).digest('hex');
}
