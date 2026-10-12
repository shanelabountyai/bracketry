// L-021. `npm run seed:bracketry`: Eastside Rec Softball in mid-season (PRD sample business, golden path 2).
// Two divisions, a published schedule, a score for every game before today and a forced three-way tie.
// Wiring only: the schedule is generateSchedule's and the table is computeStandings' (D-4). The season is
// dated around today because scores are only accepted for past days and a rainout only moves future games.
// Re-running replaces the league. `@/core/db` refuses a cloud database, as in seed-demo.ts.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { loadSeasonInput } from '@/app/o/[org]/seasons/load-input';
import { dayIn } from '@/app/o/[org]/seasons/rainout-load';
import { saveDraft } from '@/app/o/[org]/seasons/save-draft';
import { sealSecret } from '@/core/auth/secret-box';
import type { OrgCtx } from '@/core/authz/guards';
import { now } from '@/core/clock';
import { db } from '@/core/db';
import { addDays, weekday } from '@/lib/league/days';
import { materializeSlots } from '@/lib/league/materialize';
import { mulberry32, randInt } from '@/lib/league/prng';
import { generateSchedule } from '@/lib/league/schedule';
import { computeStandings } from '@/lib/league/standings';
import { DEFAULT_RULES, DEFAULT_STANDINGS, isPublishable, type GameResult } from '@/lib/league/types';
import { NAMES } from './league-capstone';
import { DEMO_TOTP_SECRET } from './seed-demo';

export const EASTSIDE = { slug: 'eastside', name: 'Eastside Rec Softball', email: 'commissioner@eastside.demo.test' } as const;
const TZ = 'America/Chicago';
const SEED = 2027;
const WEEKS = 7;
const DIVISIONS = [
  { name: 'A Division', teams: NAMES }, // the capstone's nine
  { name: 'B Division', teams: ['Jets', 'Kings', 'Lions', 'Mustangs', 'Nomads', 'Owls'] },
];
const FIELDS = ['North Diamond', 'South Diamond'];
const STARTS = ['18:00', '19:30'];
const [TUE, THU] = [2, 4];

/** A fixed id per name: team ids are the engine's sort keys, so random ones would give a different schedule on every run (D-3). */
const fixedId = (name: string) => {
  const h = createHash('sha256').update(`eastside:${name}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

type Played = { id: string; divisionId: string; home: string; away: string };

/**
 * Scores from a seed, with one thing forced: `trio` beat each other in a circle (margins 4, 3 and 2) and win
 * the same number of their other games, so the three finish level on points and the chain has work to do.
 */
function simulate(played: Played[], trio: string[], seed: number): Map<string, GameResult> {
  const rng = mulberry32(seed);
  const [a, b, c] = trio as [string, string, string];
  const circle = [[a, b, 4], [b, c, 3], [c, a, 2]] as const;
  const inTrio = (g: Played) => [g.home, g.away].filter((t) => trio.includes(t));
  const others = (t: string) => played.filter((g) => inTrio(g).length === 1 && inTrio(g)[0] === t);
  const wins = Math.min(...trio.map((t) => others(t).length));
  const lost = new Set(trio.flatMap((t) => others(t).slice(wins).map((g) => g.id)));
  const out = new Map<string, GameResult>();
  for (const g of played) {
    const mine = inTrio(g);
    if (!mine.length) {
      out.set(g.id, { home: g.home, away: g.away, homeRuns: randInt(rng, 12), awayRuns: randInt(rng, 12) });
      continue;
    }
    const low = randInt(rng, 8);
    const forced = circle.find(([w, l]) => mine.includes(w) && mine.includes(l));
    const margin = forced ? forced[2] : 1 + randInt(rng, 6);
    const winner = forced ? forced[0] : lost.has(g.id) ? (g.home === mine[0] ? g.away : g.home) : mine[0]!;
    out.set(g.id, { home: g.home, away: g.away, homeRuns: low + (winner === g.home ? margin : 0), awayRuns: low + (winner === g.away ? margin : 0) });
  }
  return out;
}

export async function seedBracketry() {
  const today = dayIn(TZ, now());
  // The first Tuesday on or after 24 days ago: three to four weeks of a seven-week season are behind us.
  let firstDay = addDays(today, -24);
  while (weekday(firstDay) !== TUE) firstDay = addDays(firstDay, 1);
  const lastDay = addDays(firstDay, (WEEKS - 1) * 7 + 2);

  const org = await db.org.upsert({ where: { slug: EASTSIDE.slug }, create: { slug: EASTSIDE.slug, name: EASTSIDE.name }, update: {} });
  // A fixed, public TOTP secret, as in seed-demo.ts: this seed cannot reach production.
  const account = { isDemo: true, name: 'Commissioner (Eastside)', totpSecretSealed: sealSecret(DEMO_TOTP_SECRET, 'totp'), totpEnrolledAt: now(), totpLastStep: null };
  const user = await db.user.upsert({ where: { email: EASTSIDE.email }, create: { email: EASTSIDE.email, ...account }, update: account });
  await db.membership.upsert({ where: { orgId_userId: { orgId: org.id, userId: user.id } }, create: { orgId: org.id, userId: user.id, role: 'owner' }, update: { role: 'owner' } });
  const o = { orgId: org.id };
  const ctx = { ...o, userId: user.id, slug: org.slug, role: 'owner' } as OrgCtx;

  // Deleting the season cascades to its results; the append-only trigger lets a cascade through (D-13).
  await db.season.deleteMany({ where: o });
  await db.field.deleteMany({ where: o });

  const season = await db.season.create({
    data: { ...o, name: `Softball ${firstDay.slice(0, 4)}`, timezone: TZ, firstDay, lastDay, gameMinutes: 90, rules: { ...DEFAULT_RULES, minRestDays: 3 } as object, standingsConfig: DEFAULT_STANDINGS as object },
  });
  const s = { ...o, seasonId: season.id };
  const names = new Map<string, string>();
  const teamId = new Map<string, string>();
  const divisionTeams: string[][] = [];
  for (const d of DIVISIONS) {
    const division = await db.division.create({ data: { ...s, id: fixedId(d.name), name: d.name, legs: 1 } });
    const rows = await db.team.createManyAndReturn({ data: d.teams.map((name) => ({ ...s, id: fixedId(name), divisionId: division.id, name, contactEmail: `coach-${name.toLowerCase()}@eastside.demo.test` })) });
    for (const t of rows) {
      names.set(t.id, t.name);
      teamId.set(t.name, t.id);
    }
    divisionTeams.push(d.teams.map((name) => teamId.get(name)!));
  }
  const fields = await db.field.createManyAndReturn({ data: FIELDS.map((name) => ({ ...o, id: fixedId(name), name })) });
  const patterns = fields.flatMap((f) => [TUE, THU].flatMap((wd) => STARTS.map((start) => ({ weekday: wd, start, fieldId: f.id }))));
  await db.slotPattern.createMany({ data: patterns.map((p) => ({ ...s, ...p })) });
  await db.fieldSlot.createMany({ data: materializeSlots(patterns, firstDay, lastDay).map((r) => ({ ...s, ...r })) });
  // The capstone's three: Comets are away for the whole second week, Giants for one evening of the third.
  await db.blackout.createMany({
    data: [['Comets', 7], ['Comets', 9], ['Giants', 14]].map(([team, offset]) => ({ ...o, teamId: teamId.get(team as string)!, day: addDays(firstDay, offset as number), reason: 'Away tournament' })),
  });

  const { input, slotRowIds } = await loadSeasonInput(ctx, season.id);
  const g = generateSchedule(input, { seed: SEED });
  if (!isPublishable(g.report)) throw new Error(`Seed ${SEED} left ${g.report.hardCount} hard violations and ${g.report.unplaced.length} unplaced games; the demo season needs a publishable schedule.`);
  const b = g.before;
  const number = await saveDraft(ctx, season.id, {
    input, assignment: g.assignment, slotRowIds, seed: SEED, iterations: g.iterations, accepted: g.accepted, action: 'schedule.generated',
    report: { ...g.report, before: { hardCount: b.hardCount, unplaced: b.unplaced.length, softCost: b.softCost } },
  });
  await db.scheduleVersion.updateMany({ where: { seasonId: season.id, number }, data: { status: 'published', reason: 'Opening day schedule', publishedAt: now() } });

  // Every game before today has been played. Today's games are tonight's.
  const placed = await db.placement.findMany({ where: { ...s, scheduleVersion: { number } }, select: { fieldSlot: { select: { day: true } }, game: { select: { id: true, key: true, divisionId: true, homeTeamId: true, awayTeamId: true } } } });
  const played: Played[] = placed
    .filter((p) => p.fieldSlot.day < today)
    .sort((x, y) => (x.game.key < y.game.key ? -1 : 1))
    .map((p) => ({ id: p.game.id, divisionId: p.game.divisionId, home: p.game.homeTeamId, away: p.game.awayTeamId }));
  const rainDay = placed.map((p) => p.fieldSlot.day).filter((d) => d > today).sort()[0]!;

  // The first three A Division teams (by name) that have all met, and the first score seed, for which those three
  // alone share a points total and the chain separates every tie in both divisions without a commissioner.
  // Teams have played different numbers of games by now, so the tie is not always at the top of the table.
  const [divA] = divisionTeams as [string[], string[]];
  const met = (x: string, y: string) => played.some((p) => (p.home === x && p.away === y) || (p.home === y && p.away === x));
  const table = (teams: string[], results: Map<string, GameResult>) => computeStandings(teams, [...results.values()], DEFAULT_STANDINGS);
  let found: { trio: string[]; results: Map<string, GameResult> } | undefined;
  search: for (let i = 0; i < divA.length; i++) for (let j = i + 1; j < divA.length; j++) for (let k = j + 1; k < divA.length; k++) {
    const trio = [divA[i]!, divA[j]!, divA[k]!];
    if (!(met(trio[0]!, trio[1]!) && met(trio[1]!, trio[2]!) && met(trio[0]!, trio[2]!))) continue;
    for (let seed = SEED; seed < SEED + 200; seed++) {
      const results = simulate(played, trio, seed);
      const rows = divisionTeams.map((teams) => table(teams, results));
      const level = rows[0]!.filter((r) => r.points === rows[0]!.find((x) => x.team === trio[0])!.points);
      if (level.length === 3 && trio.every((t) => level.some((r) => r.team === t)) && !rows.flat().some((r) => r.needsManualResolution)) {
        found = { trio: level.map((r) => r.team), results };
        break search;
      }
    }
  }
  if (!found) throw new Error('No three A Division teams that have all played each other can be left level on points on their own. Change SEED.');
  await db.gameResult.createMany({ data: [...found.results].map(([gameId, r]) => ({ ...o, gameId, homeRuns: r.homeRuns, awayRuns: r.awayRuns, enteredBy: user.id })) });

  return {
    slug: org.slug,
    email: EASTSIDE.email,
    seasonId: season.id,
    today,
    /** The next day with games: the one to rain out. */
    rainDay,
    lastDay,
    /** The three tied teams, in the order the chain ranks them. */
    trio: found.trio.map((t) => names.get(t)!),
    summary: [
      `${season.name}: ${firstDay} to ${lastDay}, ${input.games.length} games in ${input.slots.length} slots, seed ${SEED}.`,
      `Version ${number} published: soft cost ${b.softCost} before repair, ${g.report.softCost} after; ${g.iterations} iterations, ${g.accepted} accepted moves.`,
      `${played.length} games before ${today} have a score. ${found.trio.map((t) => names.get(t)).join(', ')} are level on points in A Division, ranked in that order by the tiebreak chain.`,
      `Next game day (the one to rain out): ${rainDay}.`,
      `Sign in at /demo (DEMO_MODE=1) as ${EASTSIDE.email}, then open /o/${org.slug}/seasons/${season.id}`,
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const league = await seedBracketry();
  // --json is for e2e/golden-path.spec.ts, which runs this as a process: Playwright's loader cannot import the app's server files.
  console.log(process.argv.includes('--json') ? JSON.stringify(league) : league.summary.join('\n'));
  await db.$disconnect();
}
