'use server';
import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { capRefusal, CAPS, inputHash } from '@/lib/league/build-input';
import { checkFeasibility } from '@/lib/league/feasibility';
import { generateSchedule } from '@/lib/league/schedule';
import { loadSeasonInput } from './load-input';

// Generation console (GEN-01, GEN-03..05, GEN-07, SCHED-01). Same permission as setup (D-27).
// Runs synchronously with the D-17 caps. A version is created once and never updated (D-10).
const optionalSeed = z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int('The seed must be a whole number.').min(0).max(2 ** 32 - 1, 'The seed must be below 4294967296.').optional());

export const generate = orgAction(
  'org.update',
  z.object({
    seasonId: ref('season'),
    /** Blank = a new seed. The seed is stored, so any run can be reproduced. */
    seed: optionalSeed,
    maxIterations: z.coerce.number().int().min(1).max(CAPS.maxIterations, `At most ${CAPS.maxIterations} iterations.`).default(5000),
  }),
  async (ctx, i) => {
    const { season, rows, input, slotRowIds } = await loadSeasonInput(ctx, i.seasonId);
    const refusal = capRefusal(rows.divisions, input.games.length);
    if (refusal) throw new Refused(refusal);
    if (!input.games.length) throw new Refused('Add at least two teams to a division first.');
    const feas = checkFeasibility(input);
    if (!feas.feasible) throw new Refused(`These inputs cannot fit: ${feas.shortfalls.map((s) => s.detail).join(' ')}`);

    const seed = i.seed ?? randomInt(2 ** 32);
    const result = generateSchedule(input, { seed, maxIterations: i.maxIterations });
    const b = result.before;
    const report = { ...result.report, before: { hardCount: b.hardCount, unplaced: b.unplaced.length, softCost: b.softCost } };

    try {
      await db.$transaction(async (tx) => {
        await tx.game.createMany({
          data: input.games.map((g) => ({ ...inOrg(ctx), seasonId: season.id, divisionId: g.division!, key: g.key, round: g.round, leg: g.leg, homeTeamId: g.home, awayTeamId: g.away })),
          skipDuplicates: true,
        });
        const gameIds = new Map((await tx.game.findMany({ where: { seasonId: season.id }, select: { id: true, key: true } })).map((g) => [g.key, g.id]));
        const last = await tx.scheduleVersion.aggregate({ where: { seasonId: season.id }, _max: { number: true } });
        const v = await tx.scheduleVersion.create({
          data: {
            ...inOrg(ctx),
            seasonId: season.id,
            number: (last._max.number ?? 0) + 1,
            seed: BigInt(seed),
            inputHash: inputHash(input),
            fingerprint: result.fingerprint,
            report: report as object,
            iterations: result.iterations,
            accepted: result.accepted,
            createdBy: ctx.userId,
          },
        });
        await tx.placement.createMany({
          data: Object.entries(result.assignment).map(([key, slot]) => ({ ...inOrg(ctx), seasonId: season.id, scheduleVersionId: v.id, gameId: gameIds.get(key)!, fieldSlotId: slotRowIds.get(slot)! })),
        });
        await audit(ctx, 'schedule.generated', { targetType: 'scheduleVersion', targetId: v.id, data: { seed, fingerprint: result.fingerprint } }, tx);
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') throw new Refused('Another version was created at the same moment. Generate again.');
      throw e;
    }
    revalidatePath(`/o/${ctx.slug}/seasons/${season.id}`);
    return { notice: `Draft created with seed ${seed}: ${result.report.hardCount} hard, ${result.report.unplaced.length} unplaced, soft cost ${b.softCost} → ${result.report.softCost}.` };
  },
);
