// Calendar-day arithmetic on 'YYYY-MM-DD' strings (D-6). Implemented in the starter.
// Nothing here reads the process timezone: a day is parsed by hand and counted in UTC days.
import type { Ymd } from './types';

/** Days since 1970-01-01. Throws on anything that is not a real calendar day. */
export function dayNumber(ymd: Ymd): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) throw new Error(`Not a calendar day: ${ymd}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) {
    throw new Error(`Not a calendar day: ${ymd}`);
  }
  return ms / 86_400_000;
}

export function fromDayNumber(n: number): Ymd {
  const d = new Date(n * 86_400_000);
  const p = (v: number, w: number) => String(v).padStart(w, '0');
  return `${p(d.getUTCFullYear(), 4)}-${p(d.getUTCMonth() + 1, 2)}-${p(d.getUTCDate(), 2)}`;
}

export const addDays = (ymd: Ymd, n: number): Ymd => fromDayNumber(dayNumber(ymd) + n);

/** b − a in days. */
export const dayDiff = (a: Ymd, b: Ymd): number => dayNumber(b) - dayNumber(a);

/** 0 = Sunday … 6 = Saturday. 1970-01-01 was a Thursday. */
export const weekday = (ymd: Ymd): number => (((dayNumber(ymd) + 4) % 7) + 7) % 7;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 'Sat Oct 18'. From the string by arithmetic: no locale, no timezone. */
export const shortDay = (ymd: Ymd): string => `${DOW[weekday(ymd)]} ${MONTH[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8))}`;
