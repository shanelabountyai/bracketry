// L-003. Spec: docs/prds/01-generator-spec.md §2. Pending suite: tests/unit/league-round-robin.pending.ts
import { NotImplementedError, type RoundRobin, type TeamId } from './types';

/** `L${leg}:${a}~${b}` with a < b by plain string comparison. */
export function gameKey(_leg: 1 | 2, _x: TeamId, _y: TeamId): string {
  throw new NotImplementedError('gameKey');
}

/**
 * Circle-method round robin. Pure and deterministic in the ORDER of `teams`:
 * the caller shuffles with the seeded PRNG first if it wants variety.
 */
export function roundRobin(_teams: readonly TeamId[], _opts: { legs: 1 | 2 }): RoundRobin {
  throw new NotImplementedError('roundRobin');
}
