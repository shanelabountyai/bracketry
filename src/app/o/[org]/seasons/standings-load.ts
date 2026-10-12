import { inOrg, type OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { computeStandings } from '@/lib/league/standings';
import { DEFAULT_STANDINGS, type GameResult, type StandingsConfig, type StandingsRow } from '@/lib/league/types';

/** Standings are computed on read (D-13): the newest non-superseded result per game, through the engine. */
export async function loadStandings(ctx: OrgCtx, seasonId: string) {
  const season = await db.season.findFirst({ where: { id: seasonId, ...inOrg(ctx) } });
  if (!season) return null;
  const [divisions, teams, results, resolutions] = await Promise.all([
    db.division.findMany({ where: { seasonId, ...inOrg(ctx) }, orderBy: { name: 'asc' } }),
    db.team.findMany({ where: { seasonId, ...inOrg(ctx) }, orderBy: { name: 'asc' } }),
    db.gameResult.findMany({ where: { game: { seasonId }, supersededBy: { none: {} }, ...inOrg(ctx) }, include: { game: true } }),
    db.tieResolution.findMany({ where: { division: { seasonId }, ...inOrg(ctx) }, orderBy: { decidedAt: 'asc' } }),
  ]);
  const config: StandingsConfig = { ...DEFAULT_STANDINGS, ...(season.standingsConfig as Partial<StandingsConfig>) };
  const played: GameResult[] = results.map((r) => ({ home: r.game.homeTeamId, away: r.game.awayTeamId, homeRuns: r.homeRuns, awayRuns: r.awayRuns, ...(r.forfeit && { forfeit: r.forfeit }) }));
  const byDivision = divisions.map((d) => {
    const members = teams.filter((t) => t.divisionId === d.id);
    const ids = members.map((t) => t.id);
    const manualResolutions = resolutions.filter((x) => x.divisionId === d.id).map((x) => x.teamIds as string[]);
    const rows = computeStandings(ids, played, { ...config, manualResolutions });
    // D-22: the engine names teams by id; the screen swaps in names.
    const name = (id: string) => members.find((t) => t.id === id)?.name ?? '?';
    const named = rows.map((r): StandingsRow & { name: string } => ({ ...r, name: name(r.team), note: ids.reduce((n, id) => n.replaceAll(id, name(id)), r.note) }));
    return { division: d, rows: named, name };
  });
  return { season, config, hasResults: results.length > 0, byDivision };
}
