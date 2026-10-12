'use server';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { loadStandings } from './standings-load';

// Tiebreak chain and commissioner tie decisions (STAND-03, STAND-05; D-13, D-14, D-22). Same permission as setup (D-30).
// The forms post one `pos_<id>` field per row, so the schemas are loose and the positions are read in the body.
const PERM = 'org.update' as const;

/** `pos_<id>` fields as a 1..n ordering of exactly `ids`; anything else is refused. */
function order(input: Record<string, unknown>, ids: readonly string[]): string[] {
  const at = ids.map((id) => Number(input[`pos_${id}`]));
  if (at.some((p) => !Number.isInteger(p)) || [...at].sort((a, b) => a - b).some((p, i) => p !== i + 1)) throw new Refused(`Give each row its own position from 1 to ${ids.length}.`);
  return ids.map((id, i) => [id, at[i]!] as const).sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

export const saveChain = orgAction(
  PERM,
  z.looseObject({ seasonId: ref('season'), onPartialBreak: z.enum(['restart', 'continue']), reason: z.string().trim().max(500, 'The reason is at most 500 characters.').optional() }),
  async (ctx, { seasonId, onPartialBreak, reason, ...rest }) => {
    const s = (await loadStandings(ctx, seasonId)) ?? notFound();
    const chain = order(rest, s.config.chain.map((x) => x.id)).map((id) => s.config.chain.find((x) => x.id === id)!);
    // Before the first result the chain is free to change; after it, a change needs a reason and is logged (STAND-03).
    if (s.hasResults && !reason) throw new Refused('Games have been scored, so give a reason for changing the tiebreakers.');
    // The version in the where is the guard: two commissioners saving at once cannot both win.
    const r = await db.season.updateMany({
      where: { id: seasonId, standingsConfigVersion: s.season.standingsConfigVersion, ...inOrg(ctx) },
      data: { standingsConfig: { ...s.config, chain, onPartialBreak } as object, standingsConfigVersion: { increment: 1 } },
    });
    if (!r.count) throw new Refused('Someone else just changed the tiebreakers. Reload and try again.');
    await audit(ctx, 'season.tiebreak_changed', {
      targetType: 'season',
      targetId: seasonId,
      data: { version: s.season.standingsConfigVersion + 1, before: { chain: s.config.chain.map((x) => x.id), onPartialBreak: s.config.onPartialBreak }, after: { chain: chain.map((x) => x.id), onPartialBreak }, reason: reason ?? null },
    });
    revalidatePath(`/o/${ctx.slug}/seasons/${seasonId}/standings`);
    return { notice: 'Tiebreakers saved.' };
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
