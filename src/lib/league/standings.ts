// L-008, L-023. Spec: docs/prds/02-standings-bracket-spec.md §1–§4, §8. Suite: tests/unit/league-standings.test.ts
import type { GameResult, Metric, StandingsConfig, StandingsRow, TeamId, TiebreakStep } from './types';

type Tally = Pick<StandingsRow, 'played' | 'wins' | 'losses' | 'ties' | 'points' | 'runsFor' | 'runsAgainst' | 'runDiff'>;
/** One team's place before ranks are numbered. `why` is the note without its ordinal. */
interface Placed {
  team: TeamId;
  decidedBy: string;
  why: string;
}

/**
 * §1. Results naming a team outside `teams` are dropped whole, which is also what makes a 'tied'-scope table.
 * With `oneSided` (D-40) such a result counts for the team that is in the list.
 */
function tally(teams: readonly TeamId[], results: readonly GameResult[], config: StandingsConfig, oneSided = false): Map<TeamId, Tally> {
  const rows = new Map<TeamId, Tally>(
    teams.map((t) => [t, { played: 0, wins: 0, losses: 0, ties: 0, points: 0, runsFor: 0, runsAgainst: 0, runDiff: 0 }]),
  );
  for (const g of results) {
    const home = rows.get(g.home);
    const away = rows.get(g.away);
    if (!(home && away) && !(oneSided && (home || away))) continue;
    const homeRuns = g.forfeit ? (g.forfeit === 'home' ? 0 : config.forfeitScore) : g.homeRuns;
    const awayRuns = g.forfeit ? (g.forfeit === 'away' ? 0 : config.forfeitScore) : g.awayRuns;
    // A forfeit is a win whatever the forfeit score is configured to.
    const homeSign = g.forfeit ? (g.forfeit === 'home' ? -1 : 1) : Math.sign(homeRuns - awayRuns);
    const countsInRuns = !g.forfeit || config.forfeitCountsInRuns;
    for (const [row, sign, mine, theirs] of [[home, homeSign, homeRuns, awayRuns], [away, -homeSign, awayRuns, homeRuns]] as const) {
      if (!row) continue;
      row.played += 1;
      if (sign > 0) row.wins += 1;
      else if (sign < 0) row.losses += 1;
      else row.ties += 1;
      row.points += sign > 0 ? config.points.win : sign < 0 ? config.points.loss : config.points.tie;
      if (!countsInRuns) continue;
      row.runsFor += mine;
      row.runsAgainst += theirs;
      row.runDiff += Math.max(-config.runDiffCap, Math.min(config.runDiffCap, mine - theirs));
    }
  }
  return rows;
}

/** §2. Every pair has met, and every pair the same number of times. */
function balanced(group: readonly TeamId[], results: readonly GameResult[]): boolean {
  const inGroup = new Set(group);
  const met = new Map<string, number>();
  for (const g of results) {
    if (!inGroup.has(g.home) || !inGroup.has(g.away)) continue;
    const pair = [g.home, g.away].sort().join('\u0000');
    met.set(pair, (met.get(pair) ?? 0) + 1);
  }
  return met.size === (group.length * (group.length - 1)) / 2 && new Set(met.values()).size === 1;
}

/** Higher is better for every metric once runs allowed is negated. */
const METRIC: Record<Metric, (t: Tally) => number> = {
  h2hPoints: (t) => t.points,
  runDiff: (t) => t.runDiff,
  runsAllowed: (t) => -t.runsAgainst,
  runsScored: (t) => t.runsFor,
  wins: (t) => t.wins,
};
const METRIC_LABEL: Record<Metric, string> = {
  h2hPoints: 'head-to-head',
  runDiff: 'run differential',
  runsAllowed: 'runs allowed',
  runsScored: 'runs scored',
  wins: 'wins',
};
const stepLabel = (s: TiebreakStep) =>
  s.metric === 'h2hPoints' ? METRIC_LABEL[s.metric] : s.scope === 'tied' ? `${METRIC_LABEL[s.metric]} among the tied teams` : `overall ${METRIC_LABEL[s.metric]}`;

/** Split by value, best first. Teams keep their incoming (team id) order inside a part. */
function splitBy(group: readonly TeamId[], value: (t: TeamId) => number): TeamId[][] {
  const parts = new Map<number, TeamId[]>();
  for (const t of group) {
    const v = value(t);
    parts.set(v, [...(parts.get(v) ?? []), t]);
  }
  return [...parts.entries()].sort((a, b) => b[0] - a[0]).map(([, part]) => part);
}

const names = (teams: readonly TeamId[]) => teams.join(' and ');
const versus = (over: readonly TeamId[], behind: readonly TeamId[]) =>
  [over.length ? ` over ${names(over)}` : '', behind.length ? ` behind ${names(behind)}` : ''].filter(Boolean).join(',');

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** Pure function from results. Rows come back in rank order; an unresolved group is ordered by team id. */
export function computeStandings(
  teams: readonly TeamId[],
  results: readonly GameResult[],
  config: StandingsConfig,
): StandingsRow[] {
  const ids = [...new Set(teams)].sort();
  const overall = tally(ids, results, config, config.countCrossover);

  // §2 resolve(group, step). Only ever called with two or more teams; each inner array shares one rank.
  const resolve = (group: TeamId[], step: number): Placed[][] => {
    const s = config.chain[step];
    if (!s) {
      // The last logged decision listing exactly these teams wins: the list is a log, a correction is appended.
      const manual = [...(config.manualResolutions ?? [])]
        .reverse()
        .find((m) => m.length === group.length && new Set(m).size === m.length && m.every((t) => group.includes(t)));
      if (manual) {
        return manual.map((team, i) => [
          { team, decidedBy: 'manual', why: ` by commissioner decision${versus(manual.slice(i + 1), manual.slice(0, i))}` },
        ]);
      }
      return [
        group.map((team) => ({
          team,
          decidedBy: 'unresolved',
          why: `, tied with ${names(group.filter((t) => t !== team))}: no tiebreak step separates them`,
        })),
      ];
    }
    if (s.scope === 'tied' && !balanced(group, results)) return resolve(group, step + 1);
    const table = s.scope === 'tied' ? tally(group, results, config) : overall;
    const parts = splitBy(group, (t) => METRIC[s.metric](table.get(t)!));
    if (parts.length === 1) return resolve(group, step + 1);
    return parts.flatMap((part, i) =>
      part.length === 1
        ? [[{ team: part[0]!, decidedBy: s.id, why: ` via ${stepLabel(s)}${versus(parts.slice(i + 1).flat(), parts.slice(0, i).flat())}` }]]
        : resolve(part, config.onPartialBreak === 'restart' ? 0 : step + 1),
    );
  };

  const shared = splitBy(ids, (t) => overall.get(t)!.points).flatMap((part) =>
    part.length === 1 ? [[{ team: part[0]!, decidedBy: 'points', why: ' on points' }]] : resolve(part, 0),
  );

  const rows: StandingsRow[] = [];
  for (const cluster of shared) {
    const rank = rows.length + 1;
    for (const { team, decidedBy, why } of cluster) {
      rows.push({ team, rank, ...overall.get(team)!, decidedBy, note: `${ordinal(rank)}${why}`, needsManualResolution: decidedBy === 'unresolved' });
    }
  }
  return rows;
}

/** WHATIF-02. Above this many unplayed games the 3^n enumeration is not attempted. */
export const ENUMERATION_LIMIT = 12;

export interface PointsRange {
  team: TeamId;
  bestRank: number;
  worstRank: number;
}

/**
 * §8. Best and worst finish on points alone, over every win, tie and loss of the unplayed games among `teams`.
 * No tiebreakers: best counts only teams strictly ahead, worst counts every team level or ahead. Null above the limit.
 */
export function pointsRankRange(
  teams: readonly TeamId[],
  results: readonly GameResult[],
  unplayed: readonly Pick<GameResult, 'home' | 'away'>[],
  config: StandingsConfig,
): PointsRange[] | null {
  const ids = [...new Set(teams)].sort();
  const index = new Map(ids.map((t, i) => [t, i]));
  const games = unplayed.flatMap((g) => {
    const home = index.get(g.home);
    const away = index.get(g.away);
    // -1 is a team outside the list: with countCrossover the game still moves the one team that is in it (D-40).
    const sidesIn = (home === undefined ? 0 : 1) + (away === undefined ? 0 : 1);
    return sidesIn === 2 || (sidesIn === 1 && config.countCrossover) ? [[home ?? -1, away ?? -1] as const] : [];
  });
  if (games.length > ENUMERATION_LIMIT) return null;

  const base = tally(ids, results, config, config.countCrossover);
  const points = ids.map((t) => base.get(t)!.points);
  const fewestAhead = ids.map(() => ids.length);
  const mostLevelOrAhead = ids.map(() => 0);
  const { win, tie, loss } = config.points;
  const outcomes = [[win, loss], [tie, tie], [loss, win]] as const;
  // ponytail: every leaf recounts all pairs, about 0.4 s for 9 teams and 12 games on each read. Cache per result set if the page feels slow.
  const walk = (i: number): void => {
    const g = games[i];
    if (!g) {
      for (let t = 0; t < ids.length; t++) {
        let ahead = 0;
        let level = 0;
        for (let u = 0; u < ids.length; u++) {
          if (u === t) continue;
          if (points[u]! > points[t]!) ahead += 1;
          else if (points[u] === points[t]) level += 1;
        }
        fewestAhead[t] = Math.min(fewestAhead[t]!, ahead);
        mostLevelOrAhead[t] = Math.max(mostLevelOrAhead[t]!, ahead + level);
      }
      return;
    }
    for (const [home, away] of outcomes) {
      if (g[0] >= 0) points[g[0]]! += home;
      if (g[1] >= 0) points[g[1]]! += away;
      walk(i + 1);
      if (g[0] >= 0) points[g[0]]! -= home;
      if (g[1] >= 0) points[g[1]]! -= away;
    }
  };
  walk(0);
  return ids.map((team, t) => ({ team, bestRank: fewestAhead[t]! + 1, worstRank: mostLevelOrAhead[t]! + 1 }));
}
