// Weekly slot patterns → individual slot rows (SEASON-03). Pure: days are strings, arithmetic is days.ts.
import { addDays, dayDiff, weekday } from './days';
import type { Hm, Ymd } from './types';

export interface Pattern {
  weekday: number;
  start: Hm;
  fieldId: string;
}
export interface SlotRow {
  day: Ymd;
  start: Hm;
  fieldId: string;
}

/** Every (day, start, field) a pattern produces between firstDay and lastDay inclusive, sorted by day then start then field. */
export function materializeSlots(patterns: Pattern[], firstDay: Ymd, lastDay: Ymd): SlotRow[] {
  const out: SlotRow[] = [];
  for (let i = 0, n = dayDiff(firstDay, lastDay); i <= n; i++) {
    const day = addDays(firstDay, i);
    const wd = weekday(day);
    for (const p of patterns) if (p.weekday === wd) out.push({ day, start: p.start, fieldId: p.fieldId });
  }
  return out.sort((a, b) => (a.day + a.start + a.fieldId < b.day + b.start + b.fieldId ? -1 : 1));
}
