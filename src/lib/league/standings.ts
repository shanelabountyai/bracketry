// L-008. Spec: docs/prds/02-standings-bracket-spec.md §1–§4. Pending suite: tests/unit/league-standings.pending.ts
import { NotImplementedError, type GameResult, type StandingsConfig, type StandingsRow, type TeamId } from './types';

/** Pure function from results. Rows come back in rank order; an unresolved group is ordered by team id. */
export function computeStandings(
  _teams: readonly TeamId[],
  _results: readonly GameResult[],
  _config: StandingsConfig,
): StandingsRow[] {
  throw new NotImplementedError('computeStandings');
}
