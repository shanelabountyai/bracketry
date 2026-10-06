// L-009. Spec: docs/prds/02-standings-bracket-spec.md §5–§7. Pending suite: tests/unit/league-bracket.pending.ts
import { NotImplementedError, type Bracket, type TeamId } from './types';

/** Seed numbers in bracket position order: seedOrder(8) = [1, 8, 4, 5, 2, 7, 3, 6]. `size` must be a power of two ≥ 2. */
export function seedOrder(_size: number): number[] {
  throw new NotImplementedError('seedOrder');
}

/** `teams` in seed order, best first. Byes go to the top seeds and are advanced at build time. */
export function buildBracket(_teams: readonly TeamId[]): Bracket {
  throw new NotImplementedError('buildBracket');
}

/** Returns a new bracket with the result recorded and the winner fed forward. Never mutates. */
export function recordResult(
  _bracket: Bracket,
  _matchId: string,
  _result: { aRuns: number; bRuns: number; forfeit?: 'a' | 'b' },
): Bracket {
  throw new NotImplementedError('recordResult');
}

export function champion(_bracket: Bracket): TeamId | null {
  throw new NotImplementedError('champion');
}
