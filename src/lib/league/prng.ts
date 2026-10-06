// Seeded randomness for the league engine (D-3). Implemented in the starter: it is plumbing, not the lesson.
// mulberry32: 32-bit state, deterministic across platforms because it uses only Math.imul and unsigned shifts.
// Math.random is banned in src/lib/league.

export type Rng = () => number;

/** Returns a function giving floats in [0, 1). The same seed always gives the same sequence. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export const randInt = (rng: Rng, n: number): number => Math.floor(rng() * n);

/** Fisher–Yates on a copy. The input is never mutated. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}
