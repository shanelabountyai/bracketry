'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg } from '@/core/authz/guards';
import { now } from '@/core/clock';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { dayIn } from './rainout-load';

// Score entry (SCORE-01 to SCORE-03, D-13). Same permission as setup: the scorekeeper role needs a template
// edit, so commissioners (org.update) enter and correct scores for now (D-30). A result row is never updated;
// a correction is a new row that supersedes the latest one, and so is a void (SCORE-14, D-45).
// After a void the game has no score: the next score is a plain entry that supersedes the void row.
const PERM = 'org.update' as const;

// An empty box is "not entered", never 0 (SCORE-04): z.coerce alone reads '' as 0, which saved an untouched form as 0-0.
const runs = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number('Runs must be a whole number.').int('Runs must be a whole number.').min(0, 'Runs cannot be negative.').max(99, 'Runs are at most 99.').optional());
const NO_RUNS = 'Enter the runs for both teams, or choose a forfeit.';

export const recordResult = orgAction(
  PERM,
  z.object({
    gameId: ref('game'),
    homeRuns: runs,
    awayRuns: runs,
    forfeit: z.enum(['', 'home', 'away']).optional(),
    correction: z.string().optional(), // a checked box posts 'on'
    reason: z.string().trim().max(500, 'The reason is at most 500 characters.').optional(),
  }),
  async (ctx, i) => {
    const game = (await db.game.findFirst({ where: { id: i.gameId, ...inOrg(ctx) }, include: { season: true } })) ?? notFound();
    const placement = await db.placement.findFirst({
      where: { gameId: game.id, scheduleVersion: { seasonId: game.seasonId, status: 'published' }, ...inOrg(ctx) },
      include: { fieldSlot: true },
    });
    if (!placement) throw new Refused('That game is not in the published schedule, so it cannot be scored.');
    if (placement.fieldSlot.day > dayIn(game.season.timezone, now())) throw new Refused(`That game is on ${placement.fieldSlot.day}. Only games on or before today can be scored.`);

    const forfeit = i.forfeit || null;
    const correcting = !!i.correction;
    if (correcting && !i.reason) throw new Refused('Give a reason for the correction.');

    // The newest row of the chain: the one nothing supersedes.
    const latest = await db.gameResult.findFirst({ where: { gameId: game.id, supersededBy: { none: {} }, ...inOrg(ctx) } });
    const scored = !!latest && !latest.voided;
    if (!scored && correcting) throw new Refused('There is no score to correct yet.');
    if (scored && !correcting) throw new Refused('That game already has a score. Mark this one as a correction and give a reason.');
    if (!forfeit && (i.homeRuns === undefined || i.awayRuns === undefined)) throw new Refused(NO_RUNS);

    try {
      await db.$transaction(async (tx) => {
        const row = await tx.gameResult.create({
          data: {
            ...inOrg(ctx),
            gameId: game.id,
            homeRuns: forfeit ? 0 : i.homeRuns!, // a forfeit ignores entered runs (standings spec §1)
            awayRuns: forfeit ? 0 : i.awayRuns!,
            forfeit,
            supersedesId: latest?.id ?? null,
            reason: i.reason || null,
            enteredBy: ctx.userId,
          },
        });
        await audit(ctx, scored ? 'result.corrected' : 'result.entered', { targetType: 'game', targetId: game.id, data: { resultId: row.id, forfeit, reason: i.reason ?? null } }, tx);
      });
    } catch (e) {
      // The partial unique (one original) and the unique supersedesId (superseded once) are the real guard (D-11 style).
      if ((e as { code?: string })?.code === 'P2002') throw new Refused('Someone else just scored this game. Reload and check the history.');
      throw e;
    }
    revalidatePath(`/o/${ctx.slug}/seasons/${game.seasonId}`);
    return { notice: scored ? 'Correction saved. The earlier score stays in the history.' : 'Score saved.' };
  },
);

/** SCORE-14: a score entered on the wrong game is voided by a new row, never deleted (D-13). The game is unscored again (D-45). */
export const voidResult = orgAction(
  PERM,
  z.object({ gameId: ref('game'), reason: z.string().trim().min(1, 'Give a reason for voiding the score.').max(500, 'The reason is at most 500 characters.') }),
  async (ctx, i) => {
    const game = (await db.game.findFirst({ where: { id: i.gameId, ...inOrg(ctx) } })) ?? notFound();
    const latest = await db.gameResult.findFirst({ where: { gameId: game.id, supersededBy: { none: {} }, ...inOrg(ctx) } });
    if (!latest || latest.voided) throw new Refused('That game has no score to void.');
    try {
      await db.$transaction(async (tx) => {
        const row = await tx.gameResult.create({ data: { ...inOrg(ctx), gameId: game.id, homeRuns: 0, awayRuns: 0, voided: true, supersedesId: latest.id, reason: i.reason, enteredBy: ctx.userId } });
        await audit(ctx, 'result.voided', { targetType: 'game', targetId: game.id, data: { resultId: row.id, voids: latest.id, reason: i.reason } }, tx);
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') throw new Refused('Someone else just changed this score. Reload and check the history.');
      throw e;
    }
    revalidatePath(`/o/${ctx.slug}/seasons/${game.seasonId}`);
    return { notice: 'Score voided. The game has no score again; the voided score stays in the history.' };
  },
);
