// Results for tonight (SCORE-10 to SCORE-12): what a scorekeeper still owes comes first, one group a field;
// everything else follows in date order. Days and times are strings (D-6), so plain comparison orders them.
export type ResultRow = { day: string; start: string; field: string; scored: boolean };

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byTime = (a: ResultRow, b: ResultRow) => cmp(a.day, b.day) || cmp(a.start, b.start) || cmp(a.field, b.field);

export function resultsOrder<R extends ResultRow>(rows: R[], today: string): { owed: [field: string, rows: R[]][]; rest: R[] } {
  const isOwed = (r: R) => r.day <= today && !r.scored;
  const groups = new Map<string, R[]>();
  for (const r of rows.filter(isOwed).sort(byTime)) groups.set(r.field, [...(groups.get(r.field) ?? []), r]);
  return { owed: [...groups].sort((a, b) => cmp(a[0], b[0])), rest: rows.filter((r) => !isOwed(r)).sort(byTime) };
}
