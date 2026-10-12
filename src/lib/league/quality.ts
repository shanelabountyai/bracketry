// L-020. QUAL-01, QUAL-02. Spec: docs/prds/01-generator-spec.md §6. Suite: tests/unit/league-quality.test.ts
import { dayDiff, dayNumber, weekday } from './days';
import { scoreSchedule } from './schedule';
import type { Assignment, ScheduleInput, ScoreReport, TeamId } from './types';

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export interface TeamQuality {
  team: TeamId;
  division: string;
  /** Games with a slot. */
  games: number;
  home: number;
  away: number;
  /** start → games, one entry per start time in the calendar (0 included). */
  byStart: Record<string, number>;
  /** field → games, one entry per field in the calendar (0 included). */
  byField: Record<string, number>;
  /** Fewest and most days between consecutive games; null with fewer than two games. */
  shortestRest: number | null;
  longestRest: number | null;
  /** Calendar weeks (Monday to Sunday) that have a slot and in which the team has no game. */
  byes: number;
  /** Soft violations from scoreSchedule that name this team. An equity violation names two teams. */
  flags: number;
}

export interface RestFloor {
  /** REST violations any full legal schedule must contain. */
  units: number;
  /** units × the rest weight. Every other soft rule is counted as 0, so this is a floor, not an estimate. */
  cost: number;
  /** Only teams that are forced into at least one violation. */
  perTeam: { team: TeamId; games: number; runs: number; units: number }[];
}

export interface QualityReport {
  /** The judgment: every number on cost comes from the one scoring function (D-4). */
  report: ScoreReport;
  starts: string[];
  fields: string[];
  teams: TeamQuality[];
  floor: RestFloor;
}

/**
 * A lower bound on REST cost, by counting (spec §6.4, generalised).
 *
 * Split a team's open days into runs in which every day is fewer than minRestDays after the run's first day.
 * Two different game days in one run are a REST violation, so a team that needs D game days and has R runs
 * carries at least D − R violations. Taking each run as long as possible gives the fewest runs for that rule.
 */
export function restFloor(input: ScheduleInput): RestFloor {
  const { rules } = input;
  const none: RestFloor = { units: 0, cost: 0, perTeam: [] };
  if (rules.weights.rest <= 0 || rules.minRestDays < 2 || rules.maxGamesPerTeamPerDay < 1) return none;
  const days = [...new Set(input.slots.map((s) => s.day))].sort();
  const out = new Set(input.blackouts.map((b) => `${b.team}|${b.day}`));
  const gamesOf = new Map<TeamId, number>();
  for (const g of input.games) for (const t of [g.home, g.away]) gamesOf.set(t, (gamesOf.get(t) ?? 0) + 1);

  const perTeam: RestFloor['perTeam'] = [];
  for (const [team, games] of [...gamesOf.entries()].sort((a, b) => byString(a[0], b[0]))) {
    let runs = 0;
    let first: string | null = null;
    for (const d of days) {
      if (out.has(`${team}|${d}`)) continue;
      if (first !== null && dayDiff(first, d) < rules.minRestDays) continue;
      first = d;
      runs++;
    }
    const units = Math.ceil(games / rules.maxGamesPerTeamPerDay) - runs;
    if (units > 0) perTeam.push({ team, games, runs, units });
  }
  const units = perTeam.reduce((n, t) => n + t.units, 0);
  return { units, cost: units * rules.weights.rest, perTeam };
}

/** The per-team table for one version (QUAL-01), its score, and the floor where one can be counted (QUAL-02). */
export function scheduleQuality(input: ScheduleInput, assignment: Assignment): QualityReport {
  const report = scoreSchedule(input, assignment);
  const slotById = new Map(input.slots.map((s) => [s.id, s]));
  const starts = [...new Set(input.slots.map((s) => s.start))].sort();
  const fields = [...new Set(input.slots.map((s) => s.field))].sort();
  const monday = (day: string) => dayNumber(day) - ((weekday(day) + 6) % 7);
  const weeks = new Set(input.slots.map((s) => monday(s.day)));

  const division = new Map<TeamId, string>();
  for (const g of input.games) for (const t of [g.home, g.away]) division.set(t, g.division ?? '');

  const teams = [...division.entries()]
    .sort((a, b) => byString(a[1], b[1]) || byString(a[0], b[0]))
    .map(([team, div]): TeamQuality => {
      const mine = input.games
        .filter((g) => g.home === team || g.away === team)
        .flatMap((g) => {
          const slot = slotById.get(assignment[g.key] ?? '');
          return slot ? [{ g, slot }] : [];
        })
        .sort((a, b) => byString(a.slot.day, b.slot.day) || byString(a.slot.start, b.slot.start) || byString(a.g.key, b.g.key));
      const rests = mine.slice(1).map((p, i) => dayDiff(mine[i]!.slot.day, p.slot.day));
      const count = (values: string[], of: (p: (typeof mine)[number]) => string) => Object.fromEntries(values.map((v) => [v, mine.filter((p) => of(p) === v).length]));
      return {
        team,
        division: div,
        games: mine.length,
        home: mine.filter((p) => p.g.home === team).length,
        away: mine.filter((p) => p.g.away === team).length,
        byStart: count(starts, (p) => p.slot.start),
        byField: count(fields, (p) => p.slot.field),
        shortestRest: rests.length ? Math.min(...rests) : null,
        longestRest: rests.length ? Math.max(...rests) : null,
        byes: weeks.size - new Set(mine.map((p) => monday(p.slot.day))).size,
        flags: report.soft.filter((v) => v.teams.includes(team)).length,
      };
    });
  return { report, starts, fields, teams, floor: restFloor(input) };
}
