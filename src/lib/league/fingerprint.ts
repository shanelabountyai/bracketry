// The identity of a schedule (D-3). Implemented in the starter.
// Two runs with the same input and seed must produce the same fingerprint; the publish screen shows it.
import { createHash } from 'node:crypto';
import type { Assignment } from './types';

/** sha256 over `key=slot` lines sorted by key. Key order in the object never matters. */
export function fingerprint(assignment: Assignment): string {
  const lines = Object.keys(assignment)
    .sort()
    .map((k) => `${k}=${assignment[k]}`);
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
