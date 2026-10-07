// L-003. Spec: docs/prds/01-generator-spec.md §2. Pending suite: tests/unit/league-round-robin.pending.ts
import type { Pairing, RoundRobin, TeamId } from './types';

/** `L${leg}:${a}~${b}` with a < b by plain string comparison. */
export function gameKey(leg: 1 | 2, x: TeamId, y: TeamId): string {
  const [a, b] = x < y ? [x, y] : [y, x];
  return `L${leg}:${a}~${b}`;
}

/**
 * Circle-method round robin. Pure and deterministic in the ORDER of `teams`:
 * the caller shuffles with the seeded PRNG first if it wants variety.
 */
export function roundRobin(teams: readonly TeamId[], opts: { legs: 1 | 2 }): RoundRobin {
  const n = teams.length;
  if (n < 2) throw new Error('roundRobin needs at least 2 teams');
  if (new Set(teams).size !== n) throw new Error('roundRobin needs unique team ids');

  const m = n + (n % 2); // seats; the extra seat is the bye
  const fixed = m - 1;
  const rotating = Array.from({ length: m - 1 }, (_, i) => i); // seat indices; team index >= n is the bye

  const rounds: Pairing[][] = [];
  const byes: TeamId[][] = [];
  const pair = (r: number, a: number, b: number, leg: 1 | 2): Pairing => {
    const [i, j] = a < b ? [a, b] : [b, a];
    let home = (i + j) % 2 === 1 ? i : j;
    if (leg === 2) home = home === i ? j : i;
    const away = home === i ? j : i;
    return { key: gameKey(leg, teams[i]!, teams[j]!), round: r + (leg === 2 ? m - 1 : 0), leg, home: teams[home]!, away: teams[away]! };
  };

  for (let r = 0; r < m - 1; r++) {
    // round r+1: rotate the non-fixed seats by r
    const seat = (k: number) => rotating[(k + r) % (m - 1)]!;
    const games: Array<[number, number]> = [[fixed, seat(0)]];
    for (let k = 1; k < m / 2; k++) games.push([seat(k), seat(m - 1 - k)]);
    const real = games.filter(([a, b]) => a < n && b < n);
    rounds.push(real.map(([a, b]) => pair(r + 1, a, b, 1)));
    byes.push(games.flatMap(([a, b]) => (a >= n ? [teams[b]!] : b >= n ? [teams[a]!] : [])));
  }
  if (opts.legs === 2) {
    for (let r = 0; r < m - 1; r++) {
      rounds.push(rounds[r]!.map((p) => pair(r + 1, teams.indexOf(p.home), teams.indexOf(p.away), 2)));
      byes.push(byes[r]!.slice());
    }
  }
  return { rounds, byes };
}
