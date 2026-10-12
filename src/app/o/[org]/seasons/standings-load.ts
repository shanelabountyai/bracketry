import type { OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { computeStandings } from '@/lib/league/standings';
import { DEFAULT_STANDINGS, type GameResult, type StandingsConfig, type StandingsRow } from '@/lib/league/types';

/** Standings are computed on read (D-13): the newest non-superseded result per game, through the engine. */
export async function loadStandings(ctx: Pick<OrgCtx, 'orgId'>, seasonId: string) {
  const org = { orgId: ctx.orgId }; // inOrg without a session: the public page has an org and no member (PUB-01)
  const season = await db.season.findFirst({ where: { id: seasonId, ...org } });
  if (!season) return null;
  const [divisions, teams, results, resolutions] = await Promise.all([
    db.division.findMany({ where: { seasonId, ...org }, orderBy: { name: 'asc' } }),
    db.team.findMany({ where: { seasonId, ...org }, orderBy: { name: 'asc' } }),
    db.gameResult.findMany({ where: { game: { seasonId }, supersededBy: { none: {} }, ...org }, include: { game: true } }),
    db.tieResolution.findMany({ where: { division: { seasonId }, ...org }, orderBy: { decidedAt: 'asc' } }),
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
