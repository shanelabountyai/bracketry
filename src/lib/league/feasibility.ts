// L-004. Spec: docs/prds/01-generator-spec.md §3. Suite: tests/unit/league-feasibility.test.ts
import type { FeasibilityReport, ScheduleInput } from './types';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Necessary conditions only, with the arithmetic shown. Runs before any generation. */
export function checkFeasibility(input: ScheduleInput): FeasibilityReport {
  const { games, slots, blackouts, rules } = input;
  const max = rules.maxGamesPerTeamPerDay;

  const gamesByTeam = new Map<string, number>();
  for (const g of games) for (const t of [g.home, g.away]) gamesByTeam.set(t, (gamesByTeam.get(t) ?? 0) + 1);
  const teams = [...gamesByTeam.keys()].sort();

  const days = new Map<string, { slots: number; starts: Set<string> }>();
  for (const s of slots) {
    const d = days.get(s.day) ?? { slots: 0, starts: new Set<string>() };
    d.slots++;
    d.starts.add(s.start);
    days.set(s.day, d);
  }
  const out = new Set(blackouts.map((b) => `${b.team}|${b.day}`));
  const sortedDays = [...days.keys()].sort();

  let effectiveCapacity = 0;
  for (const day of sortedDays) {
    const d = days.get(day)!;
    const avail = teams.filter((t) => !out.has(`${t}|${day}`)).length;
    effectiveCapacity += Math.min(d.slots, Math.floor((avail * Math.min(max, d.starts.size)) / 2));
  }

  const gamesNeeded = games.length;
  const slotsAvailable = slots.length;
  const shortfalls: FeasibilityReport['shortfalls'] = [];

  if (gamesNeeded > slotsAvailable) {
    const shortBy = gamesNeeded - slotsAvailable;
    shortfalls.push({
      code: 'SLOTS_SHORT',
      shortBy,
      detail: `The season needs ${plural(gamesNeeded, 'game')} but the calendar has only ${plural(slotsAvailable, 'slot')}: ${plural(shortBy, 'slot')} short.`,
    });
  }
  if (gamesNeeded > effectiveCapacity) {
    const shortBy = gamesNeeded - effectiveCapacity;
    shortfalls.push({
      code: 'DAILY_CAPACITY_SHORT',
      shortBy,
      detail: `The season needs ${plural(gamesNeeded, 'game')} but, with each team playing at most ${plural(max, 'game')} a day and blackouts counted, the calendar can host at most ${effectiveCapacity}: ${plural(shortBy, 'game')} short.`,
    });
  }

  const perTeam = teams.map((team) => {
    let playableDays = 0;
    let capacity = 0;
    for (const day of sortedDays) {
      if (out.has(`${team}|${day}`)) continue;
      playableDays++;
      capacity += Math.min(max, days.get(day)!.starts.size);
    }
    const needed = gamesByTeam.get(team)!;
    if (needed > capacity) {
      const shortBy = needed - capacity;
      shortfalls.push({
        code: 'TEAM_DAYS_SHORT',
        shortBy,
        team,
        detail: `${team} needs ${plural(needed, 'game')} but can play at most ${plural(capacity, 'game')} across its ${plural(playableDays, 'open day')}: ${plural(shortBy, 'game')} short.`,
      });
    }
    return { team, gamesNeeded: needed, playableDays, capacity };
  });

  return { feasible: shortfalls.length === 0, gamesNeeded, slotsAvailable, effectiveCapacity, perTeam, shortfalls };
}
