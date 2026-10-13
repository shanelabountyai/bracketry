// Bracketry — the type contract for the league engine.
//
// This file is the L-000 starter. It is NORMATIVE together with:
//   docs/prds/01-generator-spec.md           (round robin, feasibility, scoring, repair, reschedule)
//   docs/prds/02-standings-bracket-spec.md   (standings chain, brackets)
// Everything in src/lib/league is pure: no database, no clock, no Math.random, no process timezone.
// Randomness comes only from prng.ts with an explicit seed (D-3).

export type TeamId = string;
/** Calendar day, 'YYYY-MM-DD'. Stored as CHAR(10); never a JS Date (D-6). */
export type Ymd = string;
/** Wall time, 'HH:MM' 24h, in the league's one timezone. */
export type Hm = string;

export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`${what} is not implemented yet`);
    this.name = 'NotImplementedError';
  }
}

// ───────────────────────── Round robin (spec 01 §2) ─────────────────────────

export interface Pairing {
  /** Stable game identity, independent of round: `L${leg}:${a}~${b}` with a < b by string compare. */
  key: string;
  /** 1-based. Leg 2 continues the numbering after leg 1's last round. */
  round: number;
  leg: 1 | 2;
  home: TeamId;
  away: TeamId;
}

export interface RoundRobin {
  /** rounds[i] holds the pairings of round i+1. */
  rounds: Pairing[][];
  /** byes[i] = teams idle in round i+1: [] for an even team count, exactly one team for an odd count. */
  byes: TeamId[][];
}

// ───────────────────────── Scheduling (spec 01 §3–§7) ─────────────────────────

export interface Slot {
  id: string;
  day: Ymd;
  start: Hm;
  field: string;
}

export interface Game {
  key: string;
  round: number;
  leg: 1 | 2;
  home: TeamId;
  away: TeamId;
  /** Equity is measured inside a division. Undefined = one implicit division. */
  division?: string;
  /** A crossover game only (D-41): the away team's division. `division` is then the home team's. */
  awayDivision?: string;
}

export interface Blackout {
  team: TeamId;
  day: Ymd;
}

export interface Weights {
  rest: number;
  longGap: number;
  slotEquity: number;
  fieldEquity: number;
  rematch: number;
}

export interface Rules {
  /** Hard. Default 1. */
  maxGamesPerTeamPerDay: number;
  /** Soft REST fires when 0 < dayDiff < minRestDays between a team's consecutive games. Default 2. */
  minRestDays: number;
  /** Soft LONG_GAP fires when dayDiff > maxGapDays between a team's consecutive games. Default 14. */
  maxGapDays: number;
  /** Soft REMATCH fires when the two legs of a pairing are fewer than this many days apart. Default 14. */
  minRematchDays: number;
  weights: Weights;
}

export const DEFAULT_RULES: Rules = {
  maxGamesPerTeamPerDay: 1,
  minRestDays: 2,
  maxGapDays: 14,
  minRematchDays: 14,
  weights: { rest: 10, longGap: 3, slotEquity: 2, fieldEquity: 1, rematch: 5 },
};

export interface ScheduleInput {
  games: Game[];
  slots: Slot[];
  blackouts: Blackout[];
  rules: Rules;
  /** game key → slot id. A pinned game never moves; the generator works around it. */
  pinned?: Record<string, string>;
}

/** game key → slot id. A game with no entry is unplaced. */
export type Assignment = Record<string, string>;

export type HardCode =
  | 'SLOT_DOUBLE_BOOKED'
  | 'TEAM_SAME_TIME'
  | 'TEAM_DAY_LIMIT'
  | 'BLACKOUT'
  | 'PIN_MOVED'
  | 'UNKNOWN_SLOT';

export type SoftCode = 'REST' | 'LONG_GAP' | 'SLOT_EQUITY' | 'FIELD_EQUITY' | 'REMATCH';

export interface Violation<C extends string = string> {
  code: C;
  /** Hard: always 1 per unit. Soft: units × weight. */
  cost: number;
  teams: TeamId[];
  games: string[];
  /** Plain language, commissioner-readable: "Tigers play Tue Apr 6 and Wed Apr 7 (1 day rest, minimum 2)". */
  detail: string;
}

export interface ScoreReport {
  hard: Violation<HardCode>[];
  soft: Violation<SoftCode>[];
  /** Sum of hard costs. */
  hardCount: number;
  /** Sum of soft costs. */
  softCost: number;
  /** Keys of games with no slot, sorted. */
  unplaced: string[];
}

/** A schedule may be published only when this is true. */
export const isPublishable = (r: ScoreReport): boolean => r.hardCount === 0 && r.unplaced.length === 0;

export interface GenerateOptions {
  seed: number;
  /** Default 5000. */
  maxIterations?: number;
  /** Stop after this many iterations without an accepted move. Default 1500. */
  patience?: number;
}

export interface GenerationResult {
  assignment: Assignment;
  /** Score of the returned assignment. */
  report: ScoreReport;
  /** Score before the repair loop ran (the greedy draft, or the assignment handed to repair()). */
  before: ScoreReport;
  /** Repair iterations actually run, and how many moves were accepted. Reported, never hidden (D-5). */
  iterations: number;
  accepted: number;
  seed: number;
  /** sha256 of the canonical assignment (see fingerprint.ts). Same input + same seed → same fingerprint. */
  fingerprint: string;
}

export type FeasibilityCode = 'SLOTS_SHORT' | 'DAILY_CAPACITY_SHORT' | 'TEAM_DAYS_SHORT';

export interface FeasibilityReport {
  /** True when no NECESSARY condition fails. True does not prove a schedule exists (spec 01 §3). */
  feasible: boolean;
  gamesNeeded: number;
  slotsAvailable: number;
  /** Σ over days of min(slots that day, floor(teams not blacked out that day × maxGamesPerTeamPerDay / 2)). */
  effectiveCapacity: number;
  perTeam: { team: TeamId; gamesNeeded: number; playableDays: number; capacity: number }[];
  shortfalls: { code: FeasibilityCode; shortBy: number; team?: TeamId; detail: string }[];
}

export interface RescheduleRequest {
  /** The inventory AFTER the change: removed slots are gone, makeup slots are present. */
  input: ScheduleInput;
  current: Assignment;
  removedSlotIds: string[];
  seed: number;
}

export interface RescheduleResult {
  assignment: Assignment;
  /** Only games that sat in a removed slot may appear here (spec 01 §7: minimal perturbation). */
  moved: { game: string; from: string; to: string }[];
  /** Displaced games with no legal makeup slot. Never placed illegally. */
  unplaced: string[];
  report: ScoreReport;
}

// ───────────────────────── Standings (spec 02 §1–§4) ─────────────────────────

export interface GameResult {
  home: TeamId;
  away: TeamId;
  homeRuns: number;
  awayRuns: number;
  /** The side that forfeited. Runs are then ignored and the configured forfeit score applies. */
  forfeit?: 'home' | 'away';
}

export type Metric = 'h2hPoints' | 'runDiff' | 'runsAllowed' | 'runsScored' | 'wins';

export interface TiebreakStep {
  id: string;
  metric: Metric;
  /** 'tied' = only games among the teams still tied. 'all' = every game. */
  scope: 'tied' | 'all';
}

export interface StandingsConfig {
  points: { win: number; tie: number; loss: number };
  /** Per-game cap applied to run differential, both directions. */
  runDiffCap: number;
  /** Runs credited to the winner of a forfeit; the forfeiting side gets 0. */
  forfeitScore: number;
  /** Default false: a forfeit counts as W/L and points, but not in runs for, runs against or differential. */
  forfeitCountsInRuns: boolean;
  chain: TiebreakStep[];
  /** After a step splits a tied group, a still-tied subgroup either restarts the chain or continues to the next step. */
  onPartialBreak: 'restart' | 'continue';
  /** Logged commissioner decisions (the coin flip). Each lists the teams of one unresolved group in final order. */
  manualResolutions?: TeamId[][];
  /**
   * Default false: a result naming a team outside the list is dropped for both sides (D-22).
   * True (D-40): it counts for the team in the list, in the table and in 'all'-scope steps. 'tied'-scope steps never see it.
   */
  countCrossover?: boolean;
}

export const DEFAULT_STANDINGS: StandingsConfig = {
  points: { win: 2, tie: 1, loss: 0 },
  runDiffCap: 7,
  forfeitScore: 7,
  forfeitCountsInRuns: false,
  chain: [
    { id: 'h2h', metric: 'h2hPoints', scope: 'tied' },
    { id: 'rd-tied', metric: 'runDiff', scope: 'tied' },
    { id: 'rd-all', metric: 'runDiff', scope: 'all' },
    { id: 'ra-all', metric: 'runsAllowed', scope: 'all' },
  ],
  onPartialBreak: 'restart',
};

export interface StandingsRow {
  team: TeamId;
  /** 1-based. Teams in an unresolved group share the same rank. */
  rank: number;
  played: number;
  wins: number;
  losses: number;
  ties: number;
  points: number;
  runsFor: number;
  runsAgainst: number;
  /** Capped differential over all counted games. */
  runDiff: number;
  /** What put this row where it is: 'points', a chain step id, 'manual', or 'unresolved'. */
  decidedBy: string;
  /** Plain language: "2nd via head-to-head over Cubs" (STAND-04). */
  note: string;
  /** True for every team of an unresolved group until a manual resolution covers it. */
  needsManualResolution: boolean;
}

// ───────────────────────── Brackets (spec 02 §5–§7) ─────────────────────────

export type BracketSlot =
  | { kind: 'team'; team: TeamId; seed: number }
  | { kind: 'bye' }
  | { kind: 'from'; matchId: string };

export interface BracketMatch {
  /** `R${round}M${index}`, both 1-based. */
  id: string;
  round: number;
  index: number;
  a: BracketSlot;
  b: BracketSlot;
  winner?: TeamId;
  /** Where the winner goes; null for the final. */
  winnerTo: { matchId: string; side: 'a' | 'b' } | null;
  result?: { aRuns: number; bRuns: number; forfeit?: 'a' | 'b' };
}

export interface Bracket {
  /** Power of two ≥ team count. */
  size: number;
  /** rounds[0] is round 1. */
  rounds: BracketMatch[][];
}
