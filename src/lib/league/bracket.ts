// L-009. Spec: docs/prds/02-standings-bracket-spec.md §5–§7. Suite: tests/unit/league-bracket.test.ts
import type { Bracket, BracketMatch, BracketSlot, TeamId } from './types';

/** Seed numbers in bracket position order: seedOrder(8) = [1, 8, 4, 5, 2, 7, 3, 6]. `size` must be a power of two ≥ 2. */
export function seedOrder(size: number): number[] {
  if (!Number.isInteger(size) || size < 2 || (size & (size - 1)) !== 0) {
    throw new Error(`seedOrder needs a power of two ≥ 2, got ${size}`);
  }
  let order = [1, 2];
  for (let n = 4; n <= size; n *= 2) order = order.flatMap((s) => [s, n + 1 - s]);
  return order;
}

/** `teams` in seed order, best first. Byes go to the top seeds and are advanced at build time. */
export function buildBracket(teams: readonly TeamId[]): Bracket {
  if (teams.length < 2) throw new Error('buildBracket needs at least 2 teams');
  if (new Set(teams).size !== teams.length) throw new Error('buildBracket needs unique team ids');

  let size = 2;
  while (size < teams.length) size *= 2;
  const slot = (seed: number): BracketSlot =>
    seed <= teams.length ? { kind: 'team', team: teams[seed - 1]!, seed } : { kind: 'bye' };

  const order = seedOrder(size);
  const rounds: BracketMatch[][] = [];
  for (let round = 1, count = size / 2; count >= 1; round++, count /= 2) {
    const prev = rounds[round - 2];
    rounds.push(
      Array.from({ length: count }, (_, k): BracketMatch => {
        const index = k + 1;
        // A feeder already decided at build time (a bye) puts its team straight into this slot.
        const feed = (m: BracketMatch): BracketSlot =>
          m.winner !== undefined && m.a.kind === 'team' ? { ...m.a } : { kind: 'from', matchId: m.id };
        const a = prev ? feed(prev[2 * k]!) : slot(order[2 * k]!);
        const b = prev ? feed(prev[2 * k + 1]!) : slot(order[2 * k + 1]!);
        const match: BracketMatch = {
          id: `R${round}M${index}`,
          round,
          index,
          a,
          b,
          winnerTo: count > 1 ? { matchId: `R${round + 1}M${Math.ceil(index / 2)}`, side: index % 2 === 1 ? 'a' : 'b' } : null,
        };
        // Side `a` is the lower seed of its pair, so a bye is only ever on side `b`.
        if (a.kind === 'team' && b.kind === 'bye') match.winner = a.team;
        return match;
      }),
    );
  }
  return { size, rounds };
}

/** Returns a new bracket with the result recorded and the winner fed forward. Never mutates. */
export function recordResult(
  bracket: Bracket,
  matchId: string,
  result: { aRuns: number; bRuns: number; forfeit?: 'a' | 'b' },
): Bracket {
  const next: Bracket = structuredClone(bracket);
  const find = (id: string) => next.rounds.flat().find((m) => m.id === id);

  const match = find(matchId);
  if (!match) throw new Error(`No match ${matchId} in this bracket`);
  if (match.a.kind !== 'team' || match.b.kind !== 'team') {
    throw new Error(`${matchId} cannot take a result: it is a bye or is waiting on an earlier game`);
  }
  if (!result.forfeit && result.aRuns === result.bRuns) throw new Error(`${matchId}: a playoff game cannot end in a tie`);

  const aWins = result.forfeit ? result.forfeit === 'b' : result.aRuns > result.bRuns;
  const winner = aWins ? match.a : match.b;
  if (match.winnerTo) {
    const target = find(match.winnerTo.matchId)!;
    if (target.result) {
      throw new Error(`${matchId} cannot be corrected: ${target.id} has been played. Clear that result first`);
    }
    target[match.winnerTo.side] = { ...winner };
  }
  match.result = { ...result };
  match.winner = winner.team;
  return next;
}

export function champion(bracket: Bracket): TeamId | null {
  return bracket.rounds.at(-1)?.[0]?.winner ?? null;
}
