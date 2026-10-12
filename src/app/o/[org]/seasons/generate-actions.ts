'use server';
import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { orgAction, ref } from '@/core/authz/action';
import { Refused } from '@/core/errors';
import { capRefusal, CAPS } from '@/lib/league/build-input';
import { checkFeasibility } from '@/lib/league/feasibility';
import { generateSchedule } from '@/lib/league/schedule';
import { loadSeasonInput } from './load-input';
import { saveDraft } from './save-draft';

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

    await saveDraft(ctx, season.id, { input, assignment: result.assignment, slotRowIds, seed, report, iterations: result.iterations, accepted: result.accepted, action: 'schedule.generated' });
    revalidatePath(`/o/${ctx.slug}/seasons/${season.id}`);
    return { notice: `Draft created with seed ${seed}: ${result.report.hardCount} hard, ${result.report.unplaced.length} unplaced, soft cost ${b.softCost} → ${result.report.softCost}.` };
  },
);
