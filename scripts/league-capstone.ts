// L-010. `npm run league -- capstone --seed 2027`: the whole engine story in one run, no database (PRD §9).
// Wiring only. Every count, cost, rank and move printed here is an engine function's answer (D-4);
// the one number stated rather than computed is the floor, which is spec 01 §6.4's counting argument.
import { buildBracket, champion, recordResult } from '@/lib/league/bracket';
import { dayDiff, weekday } from '@/lib/league/days';
import { checkFeasibility } from '@/lib/league/feasibility';
import { mulberry32, randInt, shuffle } from '@/lib/league/prng';
import { gameKey, roundRobin } from '@/lib/league/round-robin';
import { generateSchedule, reschedule } from '@/lib/league/schedule';
import { computeStandings } from '@/lib/league/standings';
import { DEFAULT_STANDINGS, isPublishable, type GameResult, type ScheduleInput, type ScoreReport, type Slot } from '@/lib/league/types';
// The same season the unit suites generate, so the demo and the tests cannot drift apart.
import { capstoneSlots, input, makeSlots, rules, teamIds } from '../tests/unit/league-fixtures';

const NAMES = ['Aces', 'Bandits', 'Comets', 'Dukes', 'Eagles', 'Falcons', 'Giants', 'Hawks', 'Icemen'];
/** Spec 01 §6.4: 8 teams × 1 forced short rest + Comets × 2, at REST weight 10. */
const FLOOR = 100;

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (ymd: string) => `${DOW[weekday(ymd)]} ${MON[Number(ymd.slice(5, 7)) - 1]} ${Number(ymd.slice(8))}`;
const where = (s: Slot) => `${day(s.day)} ${s.start} ${s.field}`;
/** Engine text carries team ids (D-22); the demo reads better with names. */
const named = (s: string) => s.replace(/T(\d\d)/g, (_, n: string) => NAMES[Number(n) - 1] ?? `T${n}`);
const score = (r: ScoreReport) => `soft cost ${r.softCost}, ${r.hardCount} hard violations, ${r.unplaced.length} unplaced`;

export function capstone(seed: number): string {
  const out: string[] = [];
  const say = (line = '') => out.push(named(line));
  const head = (title: string) => say(`\n${title}\n${'─'.repeat(title.length)}`);

  const teams = teamIds(NAMES.length);
  const games = roundRobin(teams, { legs: 1 }).rounds.flat();
  const season: ScheduleInput = input(games, capstoneSlots(7), {
    rules: rules({ minRestDays: 3 }),
    blackouts: [
      { team: 'T03', day: '2027-04-13' },
      { team: 'T03', day: '2027-04-15' },
      { team: 'T07', day: '2027-04-20' },
    ],
  });
  const vs = (key: string) => {
    const g = games.find((x) => x.key === key)!;
    return named(`${g.home} v ${g.away}`);
  };

  say(`BRACKETRY CAPSTONE (seed ${seed})`);

  head('1. Can this season fit?');
  const f = checkFeasibility(season);
  const gameDays = new Set(season.slots.map((s) => s.day)).size;
  say(`Games needed:  ${f.gamesNeeded}  (${teams.length} teams, everyone plays everyone once: ${teams.length} × ${teams.length - 1} / 2)`);
  say(`Slots:         ${f.slotsAvailable}  (${gameDays} Tuesdays and Thursdays × ${f.slotsAvailable / gameDays} slots: 2 fields, 2 start times)`);
  say(`Real capacity: ${f.effectiveCapacity}  (after blackouts and the one-game-a-day limit)`);
  for (const b of season.blackouts) say(`Blackout:      ${b.team} cannot play ${day(b.day)}`);
  for (const p of f.perTeam.filter((p) => season.blackouts.some((b) => b.team === p.team))) {
    say(`               ${p.team} needs ${p.gamesNeeded} games and has ${p.playableDays} open days`);
  }
  if (f.feasible) say('Verdict: no necessary condition fails. That does not prove a schedule exists; the generator has to find one.');
  else for (const s of f.shortfalls) say(`Short: ${s.detail}`);

  head('2. The generated season');
  const g = generateSchedule(season, { seed });
  say(`Greedy draft:  ${score(g.before)}`);
  say(`After repair:  ${score(g.report)}`);
  say(`Work done:     ${g.iterations} iterations, ${g.accepted} accepted moves`);
  say(`Floor:         ${FLOOR}. Eight games in seven weeks forces every team into a two-game week, and Comets,`);
  say(`               out for a whole week, into two: 10 short rests × weight 10. No schedule can score lower.`);
  say(`               This one is ${g.report.softCost - FLOOR} above the floor. It is a heuristic's result, not a proven best.`);
  const byCode = new Map<string, number>();
  for (const v of g.report.soft) byCode.set(v.code, (byCode.get(v.code) ?? 0) + v.cost);
  say(`Soft cost by rule: ${[...byCode].sort().map(([code, cost]) => `${code} ${cost}`).join(', ') || 'none'}`);
  say(`Publishable:   ${isPublishable(g.report) ? 'yes' : 'no'}    Fingerprint: ${g.fingerprint.slice(0, 16)}`);
  say();
  const slotById = new Map(season.slots.map((s) => [s.id, s]));
  const gameAt = new Map(Object.entries(g.assignment).map(([key, slotId]) => [slotId, key]));
  const starts = new Map<string, Slot[]>();
  for (const s of [...season.slots].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    starts.set(`${s.day}|${s.start}`, [...(starts.get(`${s.day}|${s.start}`) ?? []), s]);
  }
  for (const group of starts.values()) {
    const cells = group.map((s) => `${s.field}  ${(gameAt.has(s.id) ? vs(gameAt.get(s.id)!) : '(open)').padEnd(20)}`);
    say(`  ${day(group[0]!.day).padEnd(10)} ${group[0]!.start}   ${cells.join('')}`.trimEnd());
  }
  for (const key of g.report.unplaced) say(`  Unplaced: ${vs(key)}`);

  head('3. Results, simulated from the seed');
  const rng = mulberry32(seed);
  const trio = shuffle(teams, rng).slice(0, 3) as [string, string, string];
  const [a, b, c] = trio;
  // A circle with margins 4, 3 and 2: equal points and equal head-to-head, so the chain has real work to do.
  const circle = new Map<string, [string, number]>([
    [gameKey(1, a, b), [a, 4]],
    [gameKey(1, b, c), [b, 3]],
    [gameKey(1, c, a), [c, 2]],
  ]);
  const results: GameResult[] = [...games]
    .sort((x, y) => (x.key < y.key ? -1 : 1))
    .map(({ key, home, away }) => {
      const inTrio = [home, away].filter((t) => trio.includes(t));
      if (inTrio.length === 0) return { home, away, homeRuns: randInt(rng, 12), awayRuns: randInt(rng, 12) };
      const low = randInt(rng, 8);
      const [winner, margin] = circle.get(key) ?? [inTrio[0]!, 1 + randInt(rng, 6)];
      return { home, away, homeRuns: low + (winner === home ? margin : 0), awayRuns: low + (winner === away ? margin : 0) };
    });
  say(`${results.length} games played. Scores come from the seed, with one thing forced: ${a}, ${b} and ${c}`);
  say('each beat the other six teams and beat each other in a circle, so all three finish level on points.');
  for (const r of results.filter((r) => trio.includes(r.home) && trio.includes(r.away))) {
    say(`  ${r.home} ${r.homeRuns}, ${r.away} ${r.awayRuns}`);
  }

  head('4. Standings');
  const table = computeStandings(teams, results, DEFAULT_STANDINGS);
  say(`Tiebreak chain: ${DEFAULT_STANDINGS.chain.map((s) => s.id).join(' → ')}; a partial break ${DEFAULT_STANDINGS.onPartialBreak}s the chain.`);
  say('      Team      W-L-T   Pts   RF   RA    RD  Why');
  for (const r of table) {
    const cols = [
      String(r.rank).padStart(4),
      `  ${named(r.team).padEnd(9)}`,
      `${r.wins}-${r.losses}-${r.ties}`.padStart(6),
      String(r.points).padStart(6),
      String(r.runsFor).padStart(5),
      String(r.runsAgainst).padStart(5),
      `${r.runDiff > 0 ? '+' : ''}${r.runDiff}`.padStart(6),
    ];
    say(`${cols.join('')}  ${r.note}`);
  }

  head('5. Playoffs: top 6, single elimination');
  const top = table.slice(0, 6);
  if (top.some((r) => r.needsManualResolution)) {
    say('Refused: a tie among the top 6 is unresolved. A commissioner decision must be recorded before seeding (BRKT-01).');
  } else {
    let bracket = buildBracket(top.map((r) => r.team));
    const side = (s: { kind: string; team?: string; seed?: number }) => `(${s.seed}) ${s.team}`;
    for (let r = 0; r < bracket.rounds.length; r++) {
      const count = bracket.rounds[r]!.length;
      say(count === 1 ? 'Final' : count === 2 ? 'Semifinals' : `Round ${r + 1}`);
      for (let i = 0; i < count; i++) {
        const m = bracket.rounds[r]![i]!;
        if (m.winner !== undefined) {
          say(`  ${side(m.a)} has a bye`);
          continue;
        }
        const low = randInt(rng, 8);
        const margin = 1 + randInt(rng, 6);
        const aWins = rng() < 0.5;
        bracket = recordResult(bracket, m.id, { aRuns: low + (aWins ? margin : 0), bRuns: low + (aWins ? 0 : margin) });
        const played = bracket.rounds[r]![i]!;
        say(`  ${side(played.a)} ${played.result!.aRuns}, ${side(played.b)} ${played.result!.bRuns}`);
      }
    }
    say(`Champion: ${champion(bracket)}`);
  }

  // Rain on the busiest day (the earliest of them), so the demo has the most games to move.
  const perDay = new Map<string, number>();
  for (const id of Object.values(g.assignment).sort()) perDay.set(slotById.get(id)!.day, (perDay.get(slotById.get(id)!.day) ?? 0) + 1);
  const rainDay = [...perDay].reduce((best, d) => (d[1] > best[1] ? d : best))[0];
  head(`6. Rainout: ${day(rainDay)} is washed out`);
  const removedSlotIds = season.slots.filter((s) => s.day === rainDay).map((s) => s.id);
  const makeup = makeSlots({ first: '2027-05-29', days: 1, weekdays: [6], starts: ['09:00', '10:30'], fields: ['F1', 'F2'] });
  // The engine has no clock, so the caller decides what is past (D-23): an open slot before the rain day
  // is not offered as a makeup. Slots that hold a game stay in the inventory, or those games would be displaced.
  const held = new Set(Object.values(g.assignment));
  const stillUsable = (s: Slot) => dayDiff(rainDay, s.day) > 0 || (s.day !== rainDay && held.has(s.id));
  const after: ScheduleInput = { ...season, slots: [...season.slots.filter(stillUsable), ...makeup] };
  const rain = reschedule({ input: after, current: g.assignment, removedSlotIds, seed });
  for (const s of makeup) slotById.set(s.id, s);
  say(`${removedSlotIds.length} slots closed, ${makeup.length} makeup slots opened on ${day(makeup[0]!.day)}. Open slots before the rain are in the past and not offered.`);
  for (const m of rain.moved) say(`  Moved:    ${vs(m.game).padEnd(20)} ${where(slotById.get(m.from)!)}  →  ${where(slotById.get(m.to)!)}`);
  for (const key of rain.unplaced) say(`  Unplaced: ${vs(key)} (no legal makeup slot)`);
  const others = Object.keys(g.assignment).filter((k) => !removedSlotIds.includes(g.assignment[k]!));
  const kept = others.filter((k) => rain.assignment[k] === g.assignment[k]).length;
  say(`${kept} of the ${others.length} other games kept their slot.`);
  say(`Before the rain: ${score(g.report)}`);
  say(`After the rain:  ${score(rain.report)}`);
  if (rain.report.softCost < FLOOR) say(`Under ${FLOOR} because the makeup Saturday is an eighth week; the floor was counted for seven.`);

  return out.join('\n');
}
