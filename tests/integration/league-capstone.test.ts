// L-010. The capstone is the engine end to end; no database is touched.
import { describe, expect, it } from 'vitest';
import { capstone } from '../../scripts/league-capstone';

describe('capstone (L-010)', () => {
  it('a second run prints exactly the same thing, and the seed is what decides it', () => {
    const first = capstone(2027);
    expect(capstone(2027)).toBe(first);
    expect(capstone(7)).not.toBe(first);
    expect(first).toMatch(/Publishable: +yes/);
    expect(first).toMatch(/^Champion: [A-Z][a-z]+$/m);
    expect(first).toMatch(/^\d+ of the (\d+) other games kept their slot\.$/m);
    expect(first).not.toMatch(/T0\d|undefined|unresolved/);
  });
});
