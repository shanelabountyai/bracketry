'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg, type OrgCtx } from '@/core/authz/guards';
import { now } from '@/core/clock';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { buildBracket, clearResult, recordResult } from '@/lib/league/bracket';
import { slotId } from '@/lib/league/build-input';
import { reschedule } from '@/lib/league/schedule';
import type { Bracket, Game } from '@/lib/league/types';
import { whyUnplaced } from '@/lib/league/unplaced';
import { cells, loadBrackets, replay, standingsFingerprint, type Seeding } from './bracket-load';
import { dayIn, loadRainout } from './rainout-load';

// Playoffs (BRKT-01..05, D-15, D-32). Same permission as setup and scores (D-27, D-30).
// The bracket rows are the engine's bracket, stored: every change rebuilds it from the frozen seeds and the stored
// results, makes one engine call, and writes back what the engine returns.
const PERM = 'org.update' as const;
const page = (slug: string, seasonId: string) => `/o/${slug}/seasons/${seasonId}/bracket`;
const isP2002 = (e: unknown) => (e as { code?: string })?.code === 'P2002';
type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
/** Serialises every change to one bracket. False when the bracket is gone (regenerated meanwhile). */
const lock = async (tx: Tx, id: string) => (await tx.$queryRaw<unknown[]>`SELECT 1 FROM "Bracket" WHERE "id" = ${id}::uuid FOR UPDATE`).length > 0;

/** BRKT-01..03: seed the top N from the standings as they are now and freeze them. Again = regenerate, until the first result. */
export const generateBracket = orgAction(
  PERM,
  z.object({ seasonId: ref('season'), divisionId: ref('division'), n: z.coerce.number('Choose how many teams qualify.').int().min(2, 'A bracket needs at least 2 teams.').max(16, 'A bracket holds at most 16 teams.') }),
  async (ctx, i) => {
    const s = (await loadBrackets(ctx, i.seasonId)) ?? notFound();
    const d = s.byDivision.find((x) => x.division.id === i.divisionId) ?? notFound();
    if (i.n > d.rows.length) throw new Refused(`${d.division.name} has only ${d.rows.length} teams.`);
    const top = d.rows.slice(0, i.n);
    // A tie across the cut line flags the last team in as well, so this covers who qualifies and in what order.
    const open = top.filter((r) => r.needsManualResolution);
    if (open.length) throw new Refused(`${open.map((r) => r.name).join(', ')} are in a tie that needs a commissioner decision. Record it on the standings page first.`);

    const seeds = top.map((r) => r.team);
    const built = buildBracket(seeds);
    try {
      await db.$transaction(async (tx) => {
        if (d.bracket) {
          const id = d.bracket.row.id;
          if ((await lock(tx, id)) && (await tx.bracketGame.count({ where: { bracketId: id, aRuns: { not: null } } }))) {
            throw new Refused('A playoff game has a result, so the bracket can no longer be regenerated.');
          }
          await tx.bracket.deleteMany({ where: { id, ...inOrg(ctx) } });
        }
        const row = await tx.bracket.create({
          data: {
            ...inOrg(ctx),
            divisionId: d.division.id,
            size: built.size,
            seeding: { teams: seeds, standings: d.rows } satisfies Seeding as object,
            standingsFingerprint: standingsFingerprint(d.rows),
            createdBy: ctx.userId,
            games: { create: built.rounds.flat().map((m) => ({ ...inOrg(ctx), matchId: m.id, round: m.round, index: m.index, ...cells(m) })) },
          },
        });
        await audit(ctx, d.bracket ? 'bracket.regenerated' : 'bracket.generated', { targetType: 'division', targetId: d.division.id, data: { bracketId: row.id, seeds, fingerprint: row.standingsFingerprint } }, tx);
      });
    } catch (e) {
      // One bracket per division is a unique index; two commissioners generating at once cannot both win.
      if (isP2002(e)) throw new Refused('Someone else just generated this bracket. Reload.');
      throw e;
    }
    revalidatePath(page(ctx.slug, i.seasonId));
    return { notice: `Bracket ${d.bracket ? 'regenerated' : 'generated'} for the top ${i.n}. The seeding is frozen; a later score correction will warn, not reseed.` };
  },
);

/**
 * BRKT-04: give a slot to every game of this bracket whose two teams are known and that has no score and no usable slot.
 * The games go through the rainout engine as displaced games, so legality is scoreSchedule's (D-4) against the
 * published season and every other playoff game, only free slots after today are offered (D-23), and nothing else moves (D-12).
 * Rounds follow from that: a later game's teams are known only once the earlier games have been played.
 */
export const placeBracketGames = orgAction(PERM, z.object({ bracketId: ref('bracket') }), async (ctx, i) => {
  const b = (await db.bracket.findFirst({ where: { id: i.bracketId, ...inOrg(ctx) }, include: { division: true } })) ?? notFound();
  const seasonId = b.division.seasonId;
  const r = await loadRainout(ctx, seasonId);
  const all = await db.bracketGame.findMany({
    where: { bracket: { division: { seasonId } }, aTeamId: { not: null }, bTeamId: { not: null }, ...inOrg(ctx) },
    include: { fieldSlot: true, bracket: { select: { divisionId: true, seeding: true } } },
  });
  type Row = (typeof all)[number];
  const scored = (g: Row) => g.aRuns !== null;
  const todo = all.filter((g) => g.bracketId === b.id && !scored(g) && (!g.fieldSlot || g.fieldSlot.status === 'closed'));
  if (!todo.length) throw new Refused('Every game whose teams are known already has a slot.');
  // Where they are and staying there. Another bracket's game in a closed slot is left out: it is that bracket's to place.
  const fixed = all.filter((g) => g.fieldSlot && (scored(g) || g.fieldSlot.status !== 'closed'));

  const key = (g: Row) => `P:${g.bracketId}:${g.matchId}`;
  const game = (g: Row): Game => {
    const seeds = (g.bracket.seeding as unknown as Seeding).teams;
    const [home, away] = [g.aTeamId!, g.bTeamId!].sort((x, y) => seeds.indexOf(x) - seeds.indexOf(y)); // BRKT-02: the better seed is home
    return { key: key(g), round: g.round, leg: 1, home: home!, away: away!, division: g.bracket.divisionId };
  };
  const NONE = 'unplaced';
  const current = { ...r.current };
  for (const d of r.displaced) delete current[d.key]; // a rained-out season game is the rainout tool's to move, not this action's
  const slots = [...r.rescheduleInput.slots];
  const have = new Set(slots.map((s) => s.id));
  for (const g of fixed) {
    const s = g.fieldSlot!;
    current[key(g)] = slotId(s);
    if (!have.has(slotId(s))) slots.push({ id: slotId(s), day: s.day, start: s.start, field: s.fieldId });
    have.add(slotId(s));
  }
  for (const g of todo) current[key(g)] = NONE;
  const input = { ...r.rescheduleInput, slots, games: [...r.rescheduleInput.games, ...fixed.map(game), ...todo.map(game)] };
  const out = reschedule({ input, current, removedSlotIds: [NONE], seed: 0 });

  const placed = todo.filter((g) => out.assignment[key(g)]);
  try {
    await db.$transaction(async (tx) => {
      for (const g of placed) await tx.bracketGame.update({ where: { id: g.id }, data: { fieldSlotId: r.slotRowIds.get(out.assignment[key(g)]!)! } });
      await audit(ctx, 'bracket.games_placed', { targetType: 'division', targetId: b.divisionId, data: { bracketId: b.id, placed: placed.map((g) => g.matchId), unplaced: out.unplaced.length } }, tx);
    });
  } catch (e) {
    // One playoff game per slot is a unique index (D-11 style).
    if (isP2002(e)) throw new Refused('Someone else just took one of those slots. Try again.');
    throw e;
  }
  revalidatePath(page(ctx.slug, seasonId));
  const why = todo.filter((g) => !out.assignment[key(g)]).map((g) => ` ${g.matchId}: ${whyUnplaced(input, out.assignment, key(g))}`);
  return { notice: `Placed ${placed.length} of ${todo.length} games.${why.join('')}` };
});

/** Lock the bracket, rebuild it from its rows, make one engine call, store what the engine returns. */
async function change(ctx: OrgCtx, game: { id: string; bracketId: string; matchId: string; bracket: { seeding: unknown; divisionId: string } }, action: string, fn: (b: Bracket) => Bracket, reason?: string) {
  await db.$transaction(async (tx) => {
    if (!(await lock(tx, game.bracketId))) throw new Refused('This bracket was regenerated. Reload.');
    const before = replay((game.bracket.seeding as Seeding).teams, await tx.bracketGame.findMany({ where: { bracketId: game.bracketId } }));
    let after: Bracket;
    try {
      after = fn(before);
    } catch (e) {
      throw new Refused(`${(e as Error).message}.`); // the engine's refusals are the rules of spec 02 §7, in words
    }
    for (const m of after.rounds.flat()) await tx.bracketGame.updateMany({ where: { bracketId: game.bracketId, matchId: m.id }, data: cells(m) });
    const m = (x: Bracket) => x.rounds.flat().find((y) => y.id === game.matchId);
    await audit(ctx, action, { targetType: 'division', targetId: game.bracket.divisionId, data: { bracketId: game.bracketId, matchId: game.matchId, before: m(before)?.result ?? null, after: m(after)?.result ?? null, ...(reason ? { reason } : {}) } }, tx);
  });
}
const loadGame = async (ctx: OrgCtx, id: string) =>
  (await db.bracketGame.findFirst({ where: { id, ...inOrg(ctx) }, include: { fieldSlot: true, bracket: { include: { division: { include: { season: true } } } } } })) ?? notFound();

// An empty box is "not entered", never 0 (SCORE-04): z.coerce alone reads '' as 0, which saved an untouched form as 0-0.
const runs = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number('Runs must be a whole number.').int('Runs must be a whole number.').min(0, 'Runs cannot be negative.').max(99, 'Runs are at most 99.').optional());
const NO_RUNS = 'Enter the runs for both teams, or choose a forfeit.';

/** BRKT-05: a result feeds the winner forward. Recording again is a correction: it needs a reason (SCORE-09, kept in the audit row) and is refused once the next game has a result. */
export const recordBracketResult = orgAction(
  PERM,
  z.object({ gameId: ref('bracketGame'), aRuns: runs, bRuns: runs, forfeit: z.enum(['', 'a', 'b']).optional(), reason: z.string().trim().max(500, 'The reason is at most 500 characters.').optional() }),
  async (ctx, i) => {
    const g = await loadGame(ctx, i.gameId);
    const season = g.bracket.division.season;
    // Same rule as a season score: a game is scored on or after its day, so it needs a day (BRKT-04).
    if (!g.fieldSlot) throw new Refused('Place this game in a slot before scoring it.');
    if (g.fieldSlot.day > dayIn(season.timezone, now())) throw new Refused(`That game is on ${g.fieldSlot.day}. Only games on or before today can be scored.`);
    const forfeit = i.forfeit || undefined;
    if (!forfeit && (i.aRuns === undefined || i.bRuns === undefined)) throw new Refused(NO_RUNS);
    if (g.aRuns !== null && !i.reason) throw new Refused('Give a reason for the correction.');
    const result = forfeit ? { aRuns: 0, bRuns: 0, forfeit } : { aRuns: i.aRuns!, bRuns: i.bRuns! }; // a forfeit ignores entered runs, as in the season
    await change(ctx, g, g.aRuns === null ? 'bracket.result_entered' : 'bracket.result_corrected', (b) => recordResult(b, g.matchId, result), g.aRuns === null ? undefined : i.reason);
    revalidatePath(page(ctx.slug, season.id));
    return { notice: g.aRuns === null ? 'Score saved. The winner moves on.' : 'Correction saved. The earlier score is in the audit log.' };
  },
);

/** The other half of BRKT-05: a later result is cleared before an earlier one can be corrected. */
export const clearBracketResult = orgAction(PERM, z.object({ gameId: ref('bracketGame') }), async (ctx, i) => {
  const g = await loadGame(ctx, i.gameId);
  await change(ctx, g, 'bracket.result_cleared', (b) => clearResult(b, g.matchId));
  revalidatePath(page(ctx.slug, g.bracket.division.season.id));
  return { notice: 'Result cleared.' };
});
