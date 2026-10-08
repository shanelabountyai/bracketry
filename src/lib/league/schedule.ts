// L-005 (score), L-006 (greedy + repair), L-007 (reschedule).
// Spec: docs/prds/01-generator-spec.md §4–§7. Suites: tests/unit/league-score.test.ts, league-generate.test.ts, league-reschedule.test.ts
import { dayDiff } from './days';
import { fingerprint } from './fingerprint';
import { mulberry32, randInt } from './prng';
import {
  type Assignment,
  type Game,
  type GenerateOptions,
  type GenerationResult,
  type HardCode,
  type RescheduleRequest,
  type RescheduleResult,
  type ScheduleInput,
  type ScoreReport,
  type Slot,
  type SoftCode,
  type Violation,
} from './types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Groups in sorted key order, so nothing downstream depends on insertion order (D-3). */
function grouped<T>(items: T[], key: (t: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return [...m.entries()].sort((a, b) => byString(a[0], b[0]));
}

/** The one scoring function. The repair loop, the publish gate and the quality report all call this (D-4). */
export function scoreSchedule(input: ScheduleInput, assignment: Assignment): ScoreReport {
  const { rules } = input;
  const w = rules.weights;
  const slotById = new Map(input.slots.map((s) => [s.id, s]));
  const hard: Violation<HardCode>[] = [];
  const soft: Violation<SoftCode>[] = [];
  const unplaced: string[] = [];
  const placed: { game: Game; slot: Slot }[] = [];

  for (const game of [...input.games].sort((a, b) => byString(a.key, b.key))) {
    const id = assignment[game.key];
    if (id === undefined) {
      unplaced.push(game.key);
      continue;
    }
    const slot = slotById.get(id);
    if (!slot) {
      // Takes no further part in scoring, and is not unplaced (spec §4.1).
      hard.push({ code: 'UNKNOWN_SLOT', cost: 1, teams: [game.home, game.away], games: [game.key], detail: `${game.key} is assigned to "${id}", which is not a slot in this season's calendar.` });
      continue;
    }
    placed.push({ game, slot });
  }
  const where = (s: Slot) => `${s.day} ${s.start} on ${s.field}`;
  const keys = (ps: { game: Game }[]) => ps.map((p) => p.game.key);
  const appearances = placed.flatMap((p) => [p.game.home, p.game.away].map((team) => ({ team, ...p })));

  // ── Hard (spec §4.1), one unit each ──
  for (const [, ps] of grouped(placed, (p) => p.slot.id)) {
    if (ps.length < 2) continue;
    hard.push({
      code: 'SLOT_DOUBLE_BOOKED',
      cost: ps.length - 1,
      teams: [...new Set(ps.flatMap((p) => [p.game.home, p.game.away]))].sort(),
      games: keys(ps),
      detail: `${where(ps[0]!.slot)} holds ${plural(ps.length, 'game')}: ${keys(ps).join(', ')}.`,
    });
  }
  for (const [, ps] of grouped(appearances, (p) => `${p.team}|${p.slot.day}|${p.slot.start}`)) {
    if (ps.length < 2) continue;
    hard.push({
      code: 'TEAM_SAME_TIME',
      cost: ps.length - 1,
      teams: [ps[0]!.team],
      games: keys(ps),
      detail: `${ps[0]!.team} is in ${plural(ps.length, 'game')} at ${ps[0]!.slot.start} on ${ps[0]!.slot.day}: ${keys(ps).join(', ')}.`,
    });
  }
  for (const [, ps] of grouped(appearances, (p) => `${p.team}|${p.slot.day}`)) {
    const over = ps.length - rules.maxGamesPerTeamPerDay;
    if (over <= 0) continue;
    hard.push({
      code: 'TEAM_DAY_LIMIT',
      cost: over,
      teams: [ps[0]!.team],
      games: keys(ps),
      detail: `${ps[0]!.team} has ${plural(ps.length, 'game')} on ${ps[0]!.slot.day} (limit ${rules.maxGamesPerTeamPerDay} a day).`,
    });
  }
  const out = new Set(input.blackouts.map((b) => `${b.team}|${b.day}`));
  for (const p of appearances) {
    if (!out.has(`${p.team}|${p.slot.day}`)) continue;
    hard.push({ code: 'BLACKOUT', cost: 1, teams: [p.team], games: [p.game.key], detail: `${p.team} is blacked out on ${p.slot.day} but ${p.game.key} is scheduled that day.` });
  }
  for (const p of placed) {
    const pin = input.pinned?.[p.game.key];
    // An unplaced pinned game is unplaced, not PIN_MOVED (D-21).
    if (pin === undefined || pin === p.slot.id) continue;
    hard.push({ code: 'PIN_MOVED', cost: 1, teams: [p.game.home, p.game.away], games: [p.game.key], detail: `${p.game.key} is pinned to "${pin}" but sits at ${where(p.slot)}.` });
  }

  // ── Soft (spec §4.2), units × weight. A weight of 0 turns the rule off. ──
  for (const [team, ps] of grouped(appearances, (p) => p.team)) {
    ps.sort((a, b) => byString(a.slot.day, b.slot.day) || byString(a.slot.start, b.slot.start) || byString(a.game.key, b.game.key));
    for (let i = 1; i < ps.length; i++) {
      const [a, b] = [ps[i - 1]!, ps[i]!];
      const diff = dayDiff(a.slot.day, b.slot.day);
      const base = { teams: [team], games: [a.game.key, b.game.key] };
      if (w.rest > 0 && diff > 0 && diff < rules.minRestDays) {
        soft.push({ ...base, code: 'REST', cost: w.rest, detail: `${team} plays ${a.slot.day} and ${b.slot.day} (${diff} day rest, minimum ${rules.minRestDays}).` });
      }
      if (w.longGap > 0 && diff > rules.maxGapDays) {
        soft.push({ ...base, code: 'LONG_GAP', cost: w.longGap, detail: `${team} plays ${a.slot.day} and then not until ${b.slot.day} (${diff} day gap, maximum ${rules.maxGapDays}).` });
      }
    }
  }

  // Equity: inside one division, every team of the division counts, with 0 when it has nothing placed there.
  const equity = (code: 'SLOT_EQUITY' | 'FIELD_EQUITY', weight: number, dim: (s: Slot) => string, label: (v: string) => string) => {
    if (weight <= 0) return;
    const values = [...new Set(input.slots.map(dim))].sort();
    for (const [division, gs] of grouped(input.games, (g) => g.division ?? '')) {
      const teams = [...new Set(gs.flatMap((g) => [g.home, g.away]))].sort();
      const inDivision = appearances.filter((p) => (p.game.division ?? '') === division);
      for (const v of values) {
        const counts = teams.map((team) => ({ team, n: inDivision.filter((p) => p.team === team && dim(p.slot) === v).length }));
        const most = counts.reduce((m, c) => (c.n > m.n ? c : m));
        const fewest = counts.reduce((m, c) => (c.n < m.n ? c : m));
        const units = most.n - fewest.n - 1;
        if (units <= 0) continue;
        soft.push({
          code,
          cost: units * weight,
          teams: [most.team, fewest.team],
          games: [],
          detail: `${division ? `Division ${division}: ` : ''}${most.team} has ${plural(most.n, 'game')} ${label(v)} and ${fewest.team} has ${fewest.n} (a difference of ${most.n - fewest.n}, at most 1 is free).`,
        });
      }
    }
  };
  equity('SLOT_EQUITY', w.slotEquity, (s) => s.start, (v) => `at ${v}`);
  equity('FIELD_EQUITY', w.fieldEquity, (s) => s.field, (v) => `on ${v}`);

  if (w.rematch > 0) {
    for (const [pair, ps] of grouped(placed, (p) => [p.game.home, p.game.away].sort().join('~'))) {
      const leg1 = ps.find((p) => p.game.leg === 1);
      const leg2 = ps.find((p) => p.game.leg === 2);
      if (!leg1 || !leg2) continue;
      const diff = Math.abs(dayDiff(leg1.slot.day, leg2.slot.day));
      if (diff >= rules.minRematchDays) continue;
      soft.push({
        code: 'REMATCH',
        cost: w.rematch,
        teams: pair.split('~'),
        games: [leg1.game.key, leg2.game.key],
        detail: `${pair.replace('~', ' and ')} meet on ${leg1.slot.day} and again on ${leg2.slot.day} (${plural(diff, 'day')} apart, minimum ${rules.minRematchDays}).`,
      });
    }
  }

  const sum = (vs: { cost: number }[]) => vs.reduce((n, v) => n + v.cost, 0);
  return { hard, soft, hardCount: sum(hard), softCost: sum(soft), unplaced };
}

const bySlot = (a: Slot, b: Slot) => byString(a.day, b.day) || byString(a.start, b.start) || byString(a.field, b.field);

/**
 * Phase 1 (spec §5): pins first, then games in (round, key) order, each into the first free slot in
 * (day, start, field) order that adds no hard violation. "Adds no hard violation" is scoreSchedule's answer (D-4).
 */
export function greedyDraft(input: ScheduleInput): Assignment {
  const games = [...input.games].sort((a, b) => a.round - b.round || byString(a.key, b.key));
  const slots = [...input.slots].sort(bySlot);
  const assignment: Assignment = {};
  for (const g of games) {
    const pin = input.pinned?.[g.key];
    if (pin !== undefined) assignment[g.key] = pin;
  }
  const taken = new Set(Object.values(assignment));
  // Zero unless a pin is itself illegal; the draft never adds to it.
  const hard = scoreSchedule(input, assignment).hardCount;
  for (const g of games) {
    if (assignment[g.key] !== undefined) continue;
    for (const s of slots) {
      if (taken.has(s.id)) continue;
      assignment[g.key] = s.id;
      if (scoreSchedule(input, assignment).hardCount <= hard) {
        taken.add(s.id);
        break;
      }
      delete assignment[g.key];
    }
  }
  return assignment;
}

/** Strictly better, in spec §5 order: fewer hard violations, then fewer unplaced games, then lower soft cost. */
const better = (a: ScoreReport, b: ScoreReport): boolean =>
  a.hardCount !== b.hardCount
    ? a.hardCount < b.hardCount
    : a.unplaced.length !== b.unplaced.length
      ? a.unplaced.length < b.unplaced.length
      : a.softCost < b.softCost;

/** Greedy draft, then repair. `before` is the draft's score. */
export function generateSchedule(input: ScheduleInput, opts: GenerateOptions): GenerationResult {
  return repair(input, greedyDraft(input), opts);
}

/**
 * The repair loop alone, from any starting assignment (an imported or hand-edited schedule included).
 * A local search (D-2): it reports what it measured and never claims the result is the best possible (D-5).
 * One iteration is one candidate, scored by scoreSchedule (D-4) and kept only when strictly better.
 *
 * Determinism (D-3): the seeded PRNG is the only source of choice, and every pool it indexes into is an
 * array sorted before use. Sets are used for membership only. The stop conditions are counts, never a clock.
 */
export function repair(input: ScheduleInput, start: Assignment, opts: GenerateOptions): GenerationResult {
  const rng = mulberry32(opts.seed);
  const pick = <T>(xs: T[]): T => xs[randInt(rng, xs.length)]!;
  const maxIterations = opts.maxIterations ?? 5000;
  const patience = opts.patience ?? 1500;

  // A pinned game is never a candidate and a pinned slot is never a target. That includes a pinned game
  // that arrives off its pin or unplaced: it stays reported, the loop does not touch it.
  const pinned = input.pinned ?? {};
  const pinnedSlots = new Set(Object.values(pinned));
  const movable = input.games.filter((g) => pinned[g.key] === undefined).sort((a, b) => byString(a.key, b.key));
  const slots = input.slots.filter((s) => !pinnedSlots.has(s.id)).sort(bySlot);

  let current: Assignment = { ...start };
  const before = scoreSchedule(input, current);
  let report = before;

  const propose = (): Assignment | null => {
    const placed = movable.filter((g) => current[g.key] !== undefined);
    const waiting = movable.filter((g) => current[g.key] === undefined);
    const used = new Set(Object.values(current));
    const free = slots.filter((s) => !used.has(s.id));

    // PLACE: an unplaced game into a slot; an occupant goes to a free slot, or to unplaced when none is free.
    // Only half the iterations, so a season that cannot be completed still gets its soft cost worked on.
    if (waiting.length > 0 && (placed.length === 0 || rng() < 0.5)) {
      if (slots.length === 0) return null;
      const game = pick(waiting);
      const slot = pick(slots);
      const next = { ...current, [game.key]: slot.id };
      const occupant = placed.find((g) => current[g.key] === slot.id);
      if (occupant && free.length > 0) next[occupant.key] = pick(free).id;
      else if (occupant) delete next[occupant.key];
      return next;
    }
    if (placed.length === 0) return null;

    // Focus: 80% a game the current report blames (hard first, then soft), 20% any movable game.
    // An equity violation names teams and no games, so it blames every game of those teams.
    const violations: Violation[] = report.hard.length > 0 ? report.hard : report.soft;
    const blamedKeys = new Set(violations.flatMap((v) => v.games));
    const blamedTeams = new Set(violations.filter((v) => v.games.length === 0).flatMap((v) => v.teams));
    const blamed = placed.filter((g) => blamedKeys.has(g.key) || blamedTeams.has(g.home) || blamedTeams.has(g.away));
    const game = blamed.length > 0 && rng() < 0.8 ? pick(blamed) : pick(placed);

    // MOVE to a free slot, or SWAP with another placed game.
    const others = placed.filter((g) => g !== game);
    if (free.length > 0 && (others.length === 0 || rng() < 0.5)) return { ...current, [game.key]: pick(free).id };
    if (others.length === 0) return null;
    const other = pick(others);
    return { ...current, [game.key]: current[other.key]!, [other.key]: current[game.key]! };
  };

  let iterations = 0;
  let accepted = 0;
  let stale = 0;
  while (iterations < maxIterations && stale < patience && (report.hardCount > 0 || report.unplaced.length > 0 || report.softCost > 0)) {
    const candidate = propose();
    if (!candidate) break;
    iterations++;
    // ponytail: a full re-score per candidate (spec §8 measured it as fast enough for the D-17 caps); an incremental scorer if a real run nears 5 s.
    const score = scoreSchedule(input, candidate);
    if (better(score, report)) {
      current = candidate;
      report = score;
      accepted++;
      stale = 0;
    } else {
      stale++;
    }
  }

  const assignment: Assignment = Object.fromEntries(Object.entries(current).sort((a, b) => byString(a[0], b[0])));
  return { assignment, report, before, iterations, accepted, seed: opts.seed, fingerprint: fingerprint(assignment) };
}

/**
 * Rainout (spec §7): move only the displaced games. Everything else stays exactly where it was (D-12).
 * Each displaced game, in order of its old slot, goes to the free slot that adds no hard violation and
 * gives the lowest soft cost, earliest slot on a tie; both answers are scoreSchedule's (D-4). With no such
 * slot it is unplaced (D-9). A greedy pass, one game at a time: it does not claim the best joint placement (D-5).
 *
 * `req.seed` is not read: spec §7 describes no random choice, so the result is a function of the other inputs.
 * The old slots are gone from the inventory, so "order of old slot" is the order of their ids (then game key).
 * That is (day, start, field) order when ids are `day|start|field`.
 */
export function reschedule(req: RescheduleRequest): RescheduleResult {
  const { input, current } = req;
  const removed = new Set(req.removedSlotIds);
  const inventory = new Set(input.slots.map((s) => s.id));
  const displaced = input.games
    .filter((g) => current[g.key] !== undefined && (removed.has(current[g.key]!) || !inventory.has(current[g.key]!)))
    .sort((a, b) => byString(current[a.key]!, current[b.key]!) || byString(a.key, b.key));

  const assignment: Assignment = { ...current };
  for (const g of displaced) delete assignment[g.key];
  const taken = new Set(Object.values(assignment));
  const slots = input.slots.filter((s) => !removed.has(s.id)).sort(bySlot);
  // Whatever the games that stay already score; a makeup placement never adds to it.
  const hard = scoreSchedule(input, assignment).hardCount;

  const moved: RescheduleResult['moved'] = [];
  const unplaced: string[] = [];
  for (const g of displaced) {
    let best: { slot: Slot; cost: number } | undefined;
    for (const slot of slots) {
      if (taken.has(slot.id)) continue;
      const score = scoreSchedule(input, { ...assignment, [g.key]: slot.id });
      if (score.hardCount <= hard && (!best || score.softCost < best.cost)) best = { slot, cost: score.softCost };
    }
    if (!best) {
      unplaced.push(g.key);
      continue;
    }
    assignment[g.key] = best.slot.id;
    taken.add(best.slot.id);
    moved.push({ game: g.key, from: current[g.key]!, to: best.slot.id });
  }

  const sorted: Assignment = Object.fromEntries(Object.entries(assignment).sort((a, b) => byString(a[0], b[0])));
  return { assignment: sorted, moved, unplaced, report: scoreSchedule(input, sorted) };
}
