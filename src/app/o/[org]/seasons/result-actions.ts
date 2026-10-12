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
// a correction is a new row that supersedes the latest one.
const PERM = 'org.update' as const;

const runs = z.coerce.number('Runs must be a whole number.').int('Runs must be a whole number.').min(0, 'Runs cannot be negative.').max(99, 'Runs are at most 99.');

export const recordResult = orgAction(
  PERM,
  z.object({
    gameId: ref('game'),
    homeRuns: runs.default(0),
    awayRuns: runs.default(0),
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
    if (!latest && correcting) throw new Refused('There is no score to correct yet.');
    if (latest && !correcting) throw new Refused('That game already has a score. Mark this one as a correction and give a reason.');

    try {
      await db.$transaction(async (tx) => {
        const row = await tx.gameResult.create({
          data: {
            ...inOrg(ctx),
            gameId: game.id,
            homeRuns: forfeit ? 0 : i.homeRuns, // a forfeit ignores entered runs (standings spec §1)
            awayRuns: forfeit ? 0 : i.awayRuns,
            forfeit,
            supersedesId: latest?.id ?? null,
            reason: i.reason || null,
            enteredBy: ctx.userId,
          },
        });
        await audit(ctx, latest ? 'result.corrected' : 'result.entered', { targetType: 'game', targetId: game.id, data: { resultId: row.id, forfeit, reason: i.reason ?? null } }, tx);
      });
    } catch (e) {
      // The partial unique (one original) and the unique supersedesId (superseded once) are the real guard (D-11 style).
      if ((e as { code?: string })?.code === 'P2002') throw new Refused('Someone else just scored this game. Reload and check the history.');
      throw e;
    }
    revalidatePath(`/o/${ctx.slug}/seasons/${game.seasonId}`);
    return { notice: latest ? 'Correction saved. The earlier score stays in the history.' : 'Score saved.' };
  },
);
