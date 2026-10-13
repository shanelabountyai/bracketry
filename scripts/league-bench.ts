// L-025 (BENCH-01, D-42). `npm run league:bench`: the demo season is given to three models, each is asked for a
// schedule as JSON, and every answer is scored by scoreSchedule beside the generator's (D-4). Wiring only.
// `--dry` prints the prompt and the generator's row and makes no call. Nothing is assumed about the result.
// The models see short names (G01, S01, team names), not database ids: copying UUIDs is not the skill measured.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { weekday } from '@/lib/league/days';
import { generateSchedule, scoreSchedule } from '@/lib/league/schedule';
import type { Assignment, ScheduleInput, ScoreReport } from '@/lib/league/types';

/** Dollars per million tokens, input and output, as published on 2026-10-06 (D-42's estimate used the same). */
export const PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
const RUNS = 3;
const CAP_DOLLARS = 10;
const MAX_OUTPUT = 64_000;
const SEED = 2027; // the demo seed's (scripts/seed-bracketry.ts)
const OUT = 'docs/bench-01-results.json';

type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };

/** Spend for one response, from its reported usage. Cache tokens are priced as plain input: no call here caches. */
export function dollars(model: string, u: Usage): number {
  const [inPrice, outPrice] = PRICES[model]!;
  return ((u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)) * inPrice + u.output_tokens * outPrice) / 1e6;
}

export type Answer = { game: string; slot: string }[];

/** The season under short names, and the way back to an engine Assignment. */
export function aliased(input: ScheduleInput, name: (id: string) => string = (id) => id) {
  const id = (prefix: string, i: number) => `${prefix}${String(i + 1).padStart(2, '0')}`;
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const slotRows = [...input.slots].sort((a, b) => (a.id < b.id ? -1 : 1)).map((s, i) => ({ real: s.id, id: id('S', i), day: s.day, weekday: DOW[weekday(s.day)], start: s.start, field: name(s.field) }));
  const gameRows = input.games.map((g, i) => ({
    real: g.key, id: id('G', i), leg: g.leg, home: name(g.home), away: name(g.away),
    division: name(g.division ?? ''), ...(g.awayDivision ? { awayDivision: name(g.awayDivision) } : {}),
  }));
  const slotAlias = new Map(slotRows.map((s) => [s.real, s.id]));
  const gameAlias = new Map(gameRows.map((g) => [g.real, g.id]));
  const realSlot = new Map(slotRows.map((s) => [s.id, s.real]));
  const realGame = new Map(gameRows.map((g) => [g.id, g.real]));
  return {
    season: {
      games: gameRows.map((g) => ({ ...g, real: undefined })),
      slots: slotRows.map((s) => ({ ...s, real: undefined })),
      blackouts: input.blackouts.map((b) => ({ team: name(b.team), day: b.day })),
      pinned: Object.entries(input.pinned ?? {}).map(([game, slot]) => ({ game: gameAlias.get(game)!, slot: slotAlias.get(slot)! })),
    },
    /** A game id that is not in the season is dropped and counted. A slot id that is not is passed through, so scoreSchedule reports it. */
    toAssignment(answer: Answer): { assignment: Assignment; unknownGames: number } {
      const assignment: Assignment = {};
      let unknownGames = 0;
      for (const a of answer) {
        const key = realGame.get(a.game);
        if (key) assignment[key] = realSlot.get(a.slot) ?? a.slot;
        else unknownGames++;
      }
      return { assignment, unknownGames };
    },
    toAnswer: (assignment: Assignment): Answer => Object.entries(assignment).map(([game, slot]) => ({ game: gameAlias.get(game)!, slot: slotAlias.get(slot)! })),
  };
}

/** The numbers are the season's rules; the wording follows spec 01 §4. The answer is scored by scoreSchedule, never by this text. */
export function prompt(input: ScheduleInput, season: ReturnType<typeof aliased>['season']): string {
  const r = input.rules;
  const w = r.weights;
  return `You are scheduling a recreational softball season. Assign each game to one slot.

Your answer is scored by a program. First it counts hard violations and unplaced games; a schedule can only be published with zero of both. Then it adds up a soft cost, where lower is better.

Hard rules (each violation counts 1):
- A slot holds at most one game.
- A team cannot be in two games with the same day and start time.
- A team plays at most ${r.maxGamesPerTeamPerDay} game(s) on one day.
- A team cannot play on a day it is blacked out.
- A pinned game must sit in its pinned slot.
- Only the slot ids listed below exist.
A game you leave out is "unplaced". That is not a hard violation, but it is counted.

Soft cost (the sum of these):
- REST, ${w.rest} each: for each team, two consecutive games (in date order) on different days fewer than ${r.minRestDays} days apart. Tuesday to Thursday is 2 days.
- LONG_GAP, ${w.longGap} each: for each team, two consecutive games more than ${r.maxGapDays} days apart.
- SLOT_EQUITY, weight ${w.slotEquity}: inside each division, for each start time, take the team with the most games at that time and the team with the fewest. Cost = (most - fewest - 1) x ${w.slotEquity} when that is positive.
- FIELD_EQUITY, weight ${w.fieldEquity}: the same, for each field.
- REMATCH, ${w.rematch} each: the two legs of the same pairing fewer than ${r.minRematchDays} days apart.

The season:
${JSON.stringify(season)}

Return every game you can place as {"assignments": [{"game": "G01", "slot": "S01"}, ...]}.`;
}

const FORMAT = {
  type: 'json_schema' as const,
  schema: {
    type: 'object',
    properties: {
      assignments: { type: 'array', items: { type: 'object', properties: { game: { type: 'string' }, slot: { type: 'string' } }, required: ['game', 'slot'], additionalProperties: false } },
    },
    required: ['assignments'],
    additionalProperties: false,
  },
};

type Row = { who: string; run?: number; hard: number | null; unplaced: number | null; softCost: number | null; dollars: number; seconds: number; note: string; answer?: Answer; usage?: Usage };
const scored = (r: ScoreReport) => ({ hard: r.hardCount, unplaced: r.unplaced.length, softCost: r.softCost });

function table(rows: Row[]): string {
  const cell = (v: number | null) => (v === null ? '-' : String(v));
  const lines = rows.map((r) => [r.run ? `${r.who} #${r.run}` : r.who, cell(r.hard), cell(r.unplaced), cell(r.softCost), `$${r.dollars.toFixed(4)}`, r.seconds.toFixed(r.seconds < 10 ? 3 : 0), r.note]);
  const all = [['', 'hard', 'unplaced', 'soft cost', 'dollars', 'seconds', 'note'], ...lines];
  const width = all[0]!.map((_, i) => Math.max(...all.map((l) => l[i]!.length)));
  return all.map((l) => l.map((c, i) => c.padEnd(width[i]!)).join('  ').trimEnd()).join('\n');
}

async function main() {
  const dry = process.argv.includes('--dry');
  // Loaded here, not at the top: these reach the database, and the unit suite imports this file.
  const { db } = await import('@/core/db');
  const { loadSeasonInput } = await import('@/app/o/[org]/seasons/load-input');
  const { EASTSIDE } = await import('./seed-bracketry');

  const org = await db.org.findUniqueOrThrow({ where: { slug: EASTSIDE.slug } });
  const user = await db.user.findUniqueOrThrow({ where: { email: EASTSIDE.email } });
  const season = await db.season.findFirstOrThrow({ where: { orgId: org.id } });
  const { input } = await loadSeasonInput({ orgId: org.id, userId: user.id, slug: org.slug, role: 'owner' } as never, season.id);
  const named = [
    ...(await db.team.findMany({ where: { seasonId: season.id }, select: { id: true, name: true } })),
    ...(await db.division.findMany({ where: { seasonId: season.id }, select: { id: true, name: true } })),
    ...(await db.field.findMany({ where: { orgId: org.id }, select: { id: true, name: true } })),
  ];
  await db.$disconnect();
  const names = new Map(named.map((n) => [n.id, n.name]));
  const a = aliased(input, (id) => names.get(id) ?? id);
  const text = prompt(input, a.season);

  const t0 = performance.now();
  const g = generateSchedule(input, { seed: SEED });
  const rows: Row[] = [{
    who: 'generator', ...scored(g.report), dollars: 0, seconds: (performance.now() - t0) / 1000,
    note: `seed ${SEED}; soft cost ${g.before.softCost} before repair; ${g.iterations} iterations, ${g.accepted} accepted moves`,
  }];
  const header = `${season.name} (${season.firstDay} to ${season.lastDay}): ${input.games.length} games, ${input.slots.length} slots, ${input.blackouts.length} blackouts. Prompt: ${text.length} characters.`;

  if (dry) {
    console.log(`${text}\n\n${header}\n${table(rows)}`);
    return;
  }

  const client = new Anthropic({ timeout: 30 * 60_000 });
  let spent = 0;
  const save = () => writeFileSync(OUT, `${JSON.stringify({ item: 'L-025', ranAt: new Date().toISOString(), season: header, effort: 'high', maxOutputTokens: MAX_OUTPUT, capDollars: CAP_DOLLARS, spentDollars: spent, prompt: text, rows }, null, 1)}\n`);

  bench: for (const model of Object.keys(PRICES)) {
    for (let run = 1; run <= RUNS; run++) {
      // The cap is checked against the most the next call can cost, so it cannot be passed (D-42).
      const worst = dollars(model, { input_tokens: text.length, output_tokens: MAX_OUTPUT });
      if (spent + worst > CAP_DOLLARS) {
        console.error(`Stopping before ${model} #${run}: $${spent.toFixed(4)} spent and the call could cost $${worst.toFixed(2)}, over the $${CAP_DOLLARS} cap.`);
        break bench;
      }
      const row: Row = { who: model, run, hard: null, unplaced: null, softCost: null, dollars: 0, seconds: 0, note: '' };
      const started = Date.now();
      try {
        // No refusal fallback: an answer from another model would not be this model's result.
        const message = await client.messages
          .stream({ model, max_tokens: MAX_OUTPUT, output_config: { effort: 'high', format: FORMAT }, messages: [{ role: 'user', content: text }] })
          .finalMessage();
        row.usage = message.usage;
        row.dollars = dollars(model, message.usage);
        row.note = `${message.stop_reason}; ${message.usage.output_tokens} output tokens`;
        const body = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
        if (message.stop_reason === 'end_turn') {
          row.answer = (JSON.parse(body) as { assignments: Answer }).assignments;
          const { assignment, unknownGames } = a.toAssignment(row.answer);
          Object.assign(row, scored(scoreSchedule(input, assignment)));
          if (unknownGames) row.note += `; ${unknownGames} entries named a game that is not in the season`;
        }
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw e;
        // A call that failed after it started may have been billed with no usage reported; the cap counts reported usage.
        row.note = e instanceof Anthropic.APIError ? `API error ${e.status}: ${e.message}` : `no usable answer: ${(e as Error).message}`;
      }
      row.seconds = (Date.now() - started) / 1000;
      spent += row.dollars;
      rows.push(row);
      save();
      console.error(`${model} #${run}: ${row.note} ($${spent.toFixed(4)} spent so far)`);
    }
  }
  console.log(`${header}\n${table(rows)}\nSpent $${spent.toFixed(4)} of the $${CAP_DOLLARS} cap. Rows saved to ${OUT}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
