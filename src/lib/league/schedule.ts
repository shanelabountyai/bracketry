// L-005 (score), L-006 (greedy + repair), L-007 (reschedule).
// Spec: docs/prds/01-generator-spec.md §4–§7. Pending suites: tests/unit/league-score.pending.ts, league-generate.pending.ts
import { dayDiff } from './days';
import {
  NotImplementedError,
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

/** Greedy draft, then repair. */
export function generateSchedule(_input: ScheduleInput, _opts: GenerateOptions): GenerationResult {
  throw new NotImplementedError('generateSchedule');
}

/** The repair loop alone, from any starting assignment (an imported or hand-edited schedule included). */
export function repair(_input: ScheduleInput, _start: Assignment, _opts: GenerateOptions): GenerationResult {
  throw new NotImplementedError('repair');
}

/** Rainout: move only the displaced games. Everything else stays exactly where it was. */
export function reschedule(_req: RescheduleRequest): RescheduleResult {
  throw new NotImplementedError('reschedule');
}
