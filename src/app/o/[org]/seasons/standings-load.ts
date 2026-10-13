import type { OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { computeStandings, pointsRankRange } from '@/lib/league/standings';
import { SCORED } from './rainout-load';
import { DEFAULT_STANDINGS, type GameResult, type StandingsConfig, type StandingsRow } from '@/lib/league/types';

/** Hypothetical scores by game id (WHATIF-01). Only games with no result are looked up, so a played game cannot be overridden. */
export type WhatIf = Record<string, { homeRuns: number; awayRuns: number } | undefined>;

/**
 * Standings are computed on read (D-13): the newest non-superseded result per game, through the engine. A voided game has none (D-45).
 * With `whatIf` (the standings page only) each division also gets its unplayed games and its points range (D-38).
 */
export async function loadStandings(ctx: Pick<OrgCtx, 'orgId'>, seasonId: string, whatIf?: WhatIf) {
  const org = { orgId: ctx.orgId }; // inOrg without a session: the public page has an org and no member (PUB-01)
  const season = await db.season.findFirst({ where: { id: seasonId, ...org } });
  if (!season) return null;
  const [divisions, teams, results, resolutions, unplayed] = await Promise.all([
    db.division.findMany({ where: { seasonId, ...org }, orderBy: { name: 'asc' } }),
    db.team.findMany({ where: { seasonId, ...org }, orderBy: { name: 'asc' } }),
    db.gameResult.findMany({ where: { game: { seasonId }, ...SCORED, ...org }, include: { game: true } }),
    db.tieResolution.findMany({ where: { division: { seasonId }, ...org }, orderBy: { decidedAt: 'asc' } }),
    whatIf ? db.game.findMany({ where: { seasonId, results: { none: SCORED }, ...org }, orderBy: [{ round: 'asc' }, { key: 'asc' }] }) : [],
  ]);
  const config: StandingsConfig = { ...DEFAULT_STANDINGS, ...(season.standingsConfig as Partial<StandingsConfig>) };
  // D-40: a crossover result counts in each team's own table. Passed at the call, never stored with the chain.
  const counted = { ...config, countCrossover: true };
  const played: GameResult[] = results.map((r) => ({ home: r.game.homeTeamId, away: r.game.awayTeamId, homeRuns: r.homeRuns, awayRuns: r.awayRuns, ...(r.forfeit && { forfeit: r.forfeit }) }));
  const byDivision = divisions.map((d) => {
    const members = teams.filter((t) => t.divisionId === d.id);
    // Spec 02 §10: a withdrawn team is outside the list, so it has no rank; its opponents' games against it count (§9).
    const ids = members.filter((t) => !t.withdrawnAt).map((t) => t.id);
    const manualResolutions = resolutions.filter((x) => x.divisionId === d.id).map((x) => x.teamIds as string[]);
    // A crossover game is open in both divisions' arithmetic (D-40); `listed` puts its what-if inputs under the home side only.
    const open = unplayed.filter((g) => ids.includes(g.homeTeamId) || ids.includes(g.awayTeamId)).map((g) => ({ id: g.id, home: g.homeTeamId, away: g.awayTeamId, supposed: whatIf?.[g.id], listed: g.divisionId === d.id }));
    const supposed = open.flatMap((g) => (g.supposed ? [{ home: g.home, away: g.away, ...g.supposed }] : []));
    const results = [...played, ...supposed];
    const rows = computeStandings(ids, results, { ...counted, manualResolutions });
    const range = whatIf ? pointsRankRange(ids, results, open.filter((g) => !g.supposed), counted) : null;
    // D-22: the engine names teams by id; the screen swaps in names. A crossover opponent is in another division.
    const name = (id: string) => teams.find((t) => t.id === id)?.name ?? '?';
    const named = rows.map((r): StandingsRow & { name: string } => ({ ...r, name: name(r.team), note: ids.reduce((n, id) => n.replaceAll(id, name(id)), r.note) }));
    const withdrawn = members.filter((t) => t.withdrawnAt).map((t) => ({ ...computeStandings([t.id], played, counted)[0]!, name: t.name }));
    return { division: d, rows: named, withdrawn, name, open, supposed: supposed.length, range };
  });
  return { season, config, hasResults: results.length > 0, byDivision };
}
