import type { Prisma } from '@/generated/prisma/client';
import { audit } from '@/core/audit';
import { inOrg, type OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { inputHash } from '@/lib/league/build-input';
import { fingerprint } from '@/lib/league/fingerprint';
import type { Assignment, ScheduleInput } from '@/lib/league/types';

/**
 * Writes one draft version and its placements, and returns its number. Generation, reschedule and
 * "regenerate the rest" all end here. A version is created once and never updated (D-10); `Game` rows are
 * created the first time a pairing is seen (D-28).
 */
export async function saveDraft(
  ctx: OrgCtx,
  seasonId: string,
  d: { input: ScheduleInput; assignment: Assignment; slotRowIds: Map<string, string>; seed: number; report: object; iterations: number; accepted: number; action: string; also?: (tx: Prisma.TransactionClient) => Promise<unknown> },
): Promise<number> {
  const print = fingerprint(d.assignment);
  try {
    return await db.$transaction(async (tx) => {
      await tx.game.createMany({
        data: d.input.games.map((g) => ({ ...inOrg(ctx), seasonId, divisionId: g.division!, key: g.key, round: g.round, leg: g.leg, homeTeamId: g.home, awayTeamId: g.away })),
        skipDuplicates: true,
      });
      const gameIds = new Map((await tx.game.findMany({ where: { seasonId }, select: { id: true, key: true } })).map((g) => [g.key, g.id]));
      const last = await tx.scheduleVersion.aggregate({ where: { seasonId }, _max: { number: true } });
      const v = await tx.scheduleVersion.create({
        data: {
          ...inOrg(ctx),
          seasonId,
          number: (last._max.number ?? 0) + 1,
          seed: BigInt(d.seed),
          inputHash: inputHash(d.input),
          fingerprint: print,
          report: d.report,
          iterations: d.iterations,
          accepted: d.accepted,
          createdBy: ctx.userId,
        },
      });
      await tx.placement.createMany({
        data: Object.entries(d.assignment).map(([key, slot]) => ({ ...inOrg(ctx), seasonId, scheduleVersionId: v.id, gameId: gameIds.get(key)!, fieldSlotId: d.slotRowIds.get(slot)! })),
      });
      await audit(ctx, d.action, { targetType: 'scheduleVersion', targetId: v.id, data: { seed: d.seed, fingerprint: print } }, tx);
      await d.also?.(tx); // WD-03: the withdrawal and its draft exist together or not at all
      return v.number;
    });
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') throw new Refused('Another version was created at the same moment. Try again.');
    throw e;
  }
}
