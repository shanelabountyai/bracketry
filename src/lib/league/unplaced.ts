// L-017 (RAIN-03): why a displaced game has no makeup slot. Pure, and every answer is scoreSchedule's (D-4).
import { scoreSchedule } from './schedule';
import type { Assignment, HardCode, ScheduleInput } from './types';

const WHY: Record<HardCode, string> = {
  BLACKOUT: 'on a day one of the teams is blacked out',
  TEAM_DAY_LIMIT: 'on a day one of the teams already plays',
  TEAM_SAME_TIME: 'at a time one of the teams already plays',
  SLOT_DOUBLE_BOOKED: 'already taken',
  PIN_MOVED: 'not the slot the game is pinned to',
  UNKNOWN_SLOT: 'not in the calendar',
};

/** One sentence for a game with no entry in `assignment`: how many free slots there are and what rules each one out. */
export function whyUnplaced(input: ScheduleInput, assignment: Assignment, key: string): string {
  const taken = new Set(Object.values(assignment));
  const free = input.slots.filter((s) => !taken.has(s.id));
  if (!free.length) return 'No free slot is left. Add a makeup slot.';
  const counts = new Map<HardCode, number>();
  for (const s of free) {
    const codes = new Set(scoreSchedule(input, { ...assignment, [key]: s.id }).hard.filter((v) => v.games.includes(key)).map((v) => v.code));
    for (const c of codes) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  const parts = [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([c, n]) => `${n} ${WHY[c]}`);
  return `None of the ${free.length} free slots is legal: ${parts.join(', ')}. Add a makeup slot.`;
}
