import type { Assignment } from './types';

export interface SlotMove {
  key: string;
  /** Slot in the first version, or null when the game has no placement there. */
  from: string | null;
  to: string | null;
}

/** Games whose slot differs between two versions, by game key (SCHED-03). A game placed in only one is a move from or to null. */
export function compareAssignments(a: Assignment, b: Assignment): SlotMove[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((k) => a[k] !== b[k]).map((key) => ({ key, from: a[key] ?? null, to: b[key] ?? null }));
}
