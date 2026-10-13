'use server';
import type { Prisma } from '@/generated/prisma/client';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg } from '@/core/authz/guards';
import { now } from '@/core/clock';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { scoreSchedule } from '@/lib/league/schedule';
import { loadRainout, SCORED } from './rainout-load';
import { saveDraft } from './save-draft';

// A team withdraws mid-season (WD-01 to WD-03, D-52). Same permission as setup (D-27). Its unplayed games become
// forfeit rows (spec 02 §10) and a draft takes them off the schedule (spec 01 §10). No engine call places anything:
// the draft is the published assignment with keys deleted, so no other game can move.
const PERM = 'org.update' as const;

export const withdrawTeam = orgAction(
  PERM,
  z.object({
    teamId: ref('team'),
    reason: z.string().trim().min(1, 'Give a reason for the withdrawal.').max(400, 'The reason is at most 400 characters.'),
    confirm: z.literal('on', 'Tick the box to confirm. A withdrawal cannot be undone here.'),
  }),
  async (ctx, i) => {
    const team = (await db.team.findFirst({ where: { id: i.teamId, ...inOrg(ctx) } })) ?? notFound();
    if (team.withdrawnAt) throw new Refused(`${team.name} has already withdrawn.`);
    const r = await loadRainout(ctx, team.seasonId);
    if (!r.published) throw new Refused('Publish a version first. A withdrawal is for a season in progress.');
    const published = r.published;

    const open = await db.game.findMany({
      where: { seasonId: team.seasonId, OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }], results: { none: SCORED }, ...inOrg(ctx) },
      select: {
        id: true,
        key: true,
        homeTeamId: true,
        results: { where: { supersededBy: { none: {} } }, select: { id: true } }, // a void row, when the game was scored and voided
        placements: { where: { scheduleVersionId: published.id }, select: { fieldSlot: { select: { day: true, status: true } } } },
      },
    });
    const due = [...new Set(open.flatMap((g) => g.placements).filter((p) => p.fieldSlot.status !== 'closed' && p.fieldSlot.day <= r.today).map((p) => p.fieldSlot.day))].sort();
    if (due.length) throw new Refused(`${team.name} has games on or before today with no score (${due.join(', ')}). Enter those scores first: only games not yet played are forfeited.`);

    const off = new Set(open.map((g) => g.key));
    const withdraw = async (tx: Prisma.TransactionClient) => {
      const done = await tx.team.updateMany({ where: { id: team.id, withdrawnAt: null }, data: { withdrawnAt: now() } });
      if (done.count !== 1) throw new Refused(`${team.name} has already withdrawn.`);
      await tx.gameResult.createMany({
        data: open.map((g) => ({ ...inOrg(ctx), gameId: g.id, homeRuns: 0, awayRuns: 0, forfeit: g.homeTeamId === team.id ? ('home' as const) : ('away' as const), supersedesId: g.results[0]?.id ?? null, reason: `Withdrew: ${i.reason}`, enteredBy: ctx.userId })),
      });
      await tx.pin.deleteMany({ where: { gameId: { in: open.map((g) => g.id) }, ...inOrg(ctx) } });
      await audit(ctx, 'team.withdrawn', { targetType: 'team', targetId: team.id, data: { reason: i.reason, forfeited: open.length, of: published.number } }, tx);
    };

    let draft = '';
    if (off.size) {
      const input = { ...r.rescheduleInput, games: r.rescheduleInput.games.filter((g) => !off.has(g.key)) };
      const assignment = Object.fromEntries(Object.entries(r.current).filter(([key]) => !off.has(key)));
      const number = await saveDraft(ctx, team.seasonId, {
        input,
        assignment,
        slotRowIds: r.slotRowIds,
        seed: 0, // nothing is placed, so nothing is random
        report: { ...scoreSchedule(input, assignment), withdrawal: { of: published.number, team: team.id, removed: [...off].sort() } },
        iterations: 0,
        accepted: 0,
        action: 'schedule.withdrawal',
        also: withdraw,
      });
      draft = ` Draft version ${number} takes them off the schedule; every other game keeps its slot. Publish it to free the slots and tell the opponents.`;
    } else {
      await db.$transaction(withdraw);
    }
    revalidatePath(`/o/${ctx.slug}/seasons/${team.seasonId}`);
    return { notice: `${team.name} has withdrawn. ${open.length} unplayed games are recorded as forfeits by ${team.name}.${draft}` };
  },
);
