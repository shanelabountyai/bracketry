import { createHash } from 'node:crypto';
import type { OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { buildBracket, recordResult } from '@/lib/league/bracket';
import type { Bracket, BracketMatch, BracketSlot, StandingsRow } from '@/lib/league/types';
import { loadStandings } from './standings-load';

/** `Bracket.seeding`: the frozen seed order, best first, and the division table it was read from (BRKT-03, D-15). */
export interface Seeding {
  teams: string[];
  standings: StandingsRow[];
}

/** D-15: what the seeding was frozen from. Any change to the division's table changes it. */
export const standingsFingerprint = (rows: readonly StandingsRow[]) =>
  createHash('sha256').update(rows.map((r) => [r.rank, r.team, r.played, r.wins, r.losses, r.ties, r.points, r.runsFor, r.runsAgainst, r.runDiff].join('|')).join('\n')).digest('hex');

interface ResultCells { matchId: string; round: number; index: number; aRuns: number | null; bRuns: number | null; forfeit: 'a' | 'b' | null }

/** The engine's bracket from its rows: the frozen seeds, then every stored result replayed in round order. */
export const replay = (seeds: readonly string[], games: readonly ResultCells[]): Bracket =>
  games
    .filter((g) => g.aRuns !== null && g.bRuns !== null)
    .sort((x, y) => x.round - y.round || x.index - y.index)
    .reduce((b, g) => recordResult(b, g.matchId, { aRuns: g.aRuns!, bRuns: g.bRuns!, ...(g.forfeit && { forfeit: g.forfeit }) }), buildBracket(seeds));

const team = (s: BracketSlot) => (s.kind === 'team' ? s.team : null);
/** One engine match as the columns that store it. */
export const cells = (m: BracketMatch) => ({ aTeamId: team(m.a), bTeamId: team(m.b), aRuns: m.result?.aRuns ?? null, bRuns: m.result?.bRuns ?? null, forfeit: m.result?.forfeit ?? null, winnerTeamId: m.winner ?? null });

/** Standings as they are now, and each division's bracket beside them (BRKT-01..05). */
export async function loadBrackets(ctx: Pick<OrgCtx, 'orgId'>, seasonId: string) {
  const org = { orgId: ctx.orgId }; // inOrg without a session: the public page has an org and no member (PUB-01)
  const s = await loadStandings(ctx, seasonId);
  if (!s) return null;
  const [brackets, unscored] = await Promise.all([
    db.bracket.findMany({ where: { division: { seasonId }, ...org }, include: { games: { include: { fieldSlot: { include: { field: true } } } } } }),
    db.placement.findMany({ where: { scheduleVersion: { seasonId, status: 'published' }, game: { results: { none: {} } }, ...org }, select: { game: { select: { homeTeamId: true, awayTeamId: true } } } }),
  ]);
  const byDivision = s.byDivision.map((d) => {
    const row = brackets.find((b) => b.divisionId === d.division.id);
    const seeds = row ? (row.seeding as unknown as Seeding).teams : [];
    return {
      ...d,
      /** Scheduled season games with no score: the standings are not final while this is above zero. */
      unscored: unscored.filter((p) => d.rows.some((r) => r.team === p.game.homeTeamId || r.team === p.game.awayTeamId)).length,
      bracket: row && {
        row,
        seeds,
        bracket: replay(seeds, row.games),
        /** Regenerating is allowed only before the first playoff result (BRKT-03). */
        started: row.games.some((g) => g.aRuns !== null),
        /** The division's table is no longer the one the seeding was frozen from. */
        stale: standingsFingerprint(d.rows) !== row.standingsFingerprint,
        /** Regenerating now would seed different teams or a different order. */
        reseeds: d.rows.slice(0, seeds.length).map((r) => r.team).join() !== seeds.join(),
      },
    };
  });
  return { ...s, byDivision };
}
