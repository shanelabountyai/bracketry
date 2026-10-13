'use server';
import { isDeepStrictEqual } from 'node:util';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg, type OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import type { StandingsConfig } from '@/lib/league/types';
import { loadStandings } from './standings-load';

// Tiebreak chain and commissioner tie decisions (STAND-03, STAND-05; D-13, D-14, D-22). Same permission as setup (D-30).
// The forms post one `pos_<id>` field per row, so the schemas are loose and the positions are read in the body.
const PERM = 'org.update' as const;
const reason = z.string().trim().max(500, 'The reason is at most 500 characters.').optional();
// An empty box is "not entered", never 0: z.coerce alone reads '' as 0 (SCORE-04).
const int = (min: number, max: number, what: string) =>
  z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number(`${what} must be a whole number.`).int(`${what} must be a whole number.`).min(min, `${what} must be at least ${min}.`).max(max, `${what} must be at most ${max}.`));

/** `pos_<id>` fields as a 1..n ordering of exactly `ids`; anything else is refused. */
function order(input: Record<string, unknown>, ids: readonly string[]): string[] {
  const at = ids.map((id) => Number(input[`pos_${id}`]));
  if (at.some((p) => !Number.isInteger(p)) || [...at].sort((a, b) => a - b).some((p, i) => p !== i + 1)) throw new Refused(`Give each row its own position from 1 to ${ids.length}.`);
  return ids.map((id, i) => [id, at[i]!] as const).sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

type Loaded = NonNullable<Awaited<ReturnType<typeof loadStandings>>>;

/**
 * The one write to a season's standings settings (STAND-03, STAND-07). Before the first result they are free to change;
 * after it, a change needs a reason. Either way it is logged with the values before and after.
 */
async function writeConfig(ctx: OrgCtx, s: Loaded, change: Partial<StandingsConfig>, reason: string | undefined, action: string, what: string, before: object, after: object) {
  // STAND-10: the same values again are not a change: no version, no audit row, and no reason asked for.
  if (isDeepStrictEqual(before, after)) throw new Refused('Nothing was changed, so nothing was saved.');
  if (s.hasResults && !reason) throw new Refused(`Games have been scored, so give a reason for changing ${what}.`);
  // The version in the where is the guard: two commissioners saving at once cannot both win.
  const r = await db.season.updateMany({
    where: { id: s.season.id, standingsConfigVersion: s.season.standingsConfigVersion, ...inOrg(ctx) },
    data: { standingsConfig: { ...s.config, ...change } as object, standingsConfigVersion: { increment: 1 } },
  });
  if (!r.count) throw new Refused('Someone else just changed the standings settings. Reload and try again.');
  await audit(ctx, action, { targetType: 'season', targetId: s.season.id, data: { version: s.season.standingsConfigVersion + 1, before, after, reason: reason ?? null } });
}

export const saveChain = orgAction(
  PERM,
  z.looseObject({ seasonId: ref('season'), onPartialBreak: z.enum(['restart', 'continue']), reason }),
  async (ctx, { seasonId, onPartialBreak, reason, ...rest }) => {
    const s = (await loadStandings(ctx, seasonId)) ?? notFound();
    const chain = order(rest, s.config.chain.map((x) => x.id)).map((id) => s.config.chain.find((x) => x.id === id)!);
    await writeConfig(ctx, s, { chain, onPartialBreak }, reason, 'season.tiebreak_changed', 'the tiebreakers', { chain: s.config.chain.map((x) => x.id), onPartialBreak: s.config.onPartialBreak }, { chain: chain.map((x) => x.id), onPartialBreak });
    revalidatePath(`/o/${ctx.slug}/seasons/${seasonId}/standings`);
    return { notice: 'Tiebreakers saved.' };
  },
);

// Points, the run-difference cap and the forfeit settings (STAND-02, STAND-07 to STAND-09; D-48). Nothing is recomputed here: standings are read through the engine (D-13).
export const saveScoring = orgAction(
  PERM,
  z.object({
    seasonId: ref('season'),
    win: int(0, 9, 'Points for a win'),
    tie: int(0, 9, 'Points for a tie'),
    loss: int(0, 9, 'Points for a loss'),
    runDiffCap: int(1, 99, 'The run-difference cap'),
    forfeitScore: int(0, 99, 'The forfeit score'),
    forfeitCountsInRuns: z.enum(['yes', 'no']),
    reason,
  }),
  async (ctx, { seasonId, win, tie, loss, runDiffCap, forfeitScore, forfeitCountsInRuns, reason }) => {
    const s = (await loadStandings(ctx, seasonId)) ?? notFound();
    if (win < tie || tie < loss) throw new Refused('A win must be worth at least a tie, and a tie at least a loss.');
    const after = { points: { win, tie, loss }, runDiffCap, forfeitScore, forfeitCountsInRuns: forfeitCountsInRuns === 'yes' };
    const { points, runDiffCap: cap, forfeitScore: score, forfeitCountsInRuns: counts } = s.config;
    await writeConfig(ctx, s, after, reason, 'season.scoring_changed', 'the points or run settings', { points, runDiffCap: cap, forfeitScore: score, forfeitCountsInRuns: counts }, after);
    revalidatePath(`/o/${ctx.slug}/seasons/${seasonId}/standings`);
    return { notice: 'Points and run settings saved. The standings above are worked out again from every score.' };
  },
);

export const recordTie = orgAction(
  PERM,
  z.looseObject({ seasonId: ref('season'), divisionId: ref('division'), method: z.enum(['coin flip', 'drawn lots']) }),
  async (ctx, { seasonId, divisionId, method, ...rest }) => {
    const s = (await loadStandings(ctx, seasonId)) ?? notFound();
    const d = s.byDivision.find((x) => x.division.id === divisionId) ?? notFound();
    // The decision must name exactly one group the engine reports as unresolved right now (D-22).
    const open = d.rows.filter((r) => r.needsManualResolution);
    const group = [...new Set(open.map((r) => r.rank))].map((rank) => open.filter((r) => r.rank === rank).map((r) => r.team));
    const ids = group.find((g) => g.every((t) => `pos_${t}` in rest));
    if (!ids || Object.keys(rest).filter((k) => k.startsWith('pos_')).length !== ids.length) throw new Refused('That tie is already decided or has changed. Reload and check the standings.');
    await db.$transaction(async (tx) => {
      const row = await tx.tieResolution.create({ data: { ...inOrg(ctx), divisionId, teamIds: order(rest, ids), method, decidedBy: ctx.userId } });
      await audit(ctx, 'standings.tie_decided', { targetType: 'division', targetId: divisionId, data: { resolutionId: row.id, method } }, tx);
    });
    revalidatePath(`/o/${ctx.slug}/seasons/${seasonId}/standings`);
    return { notice: 'Decision recorded. It stays in the log; a correction is a new decision.' };
  },
);
