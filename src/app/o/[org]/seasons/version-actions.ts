'use server';
import { revalidatePath } from 'next/cache';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg } from '@/core/authz/guards';
import { now } from '@/core/clock';
import { db } from '@/core/db';
import { env } from '@/core/env';
import { Refused } from '@/core/errors';
import { revokeShareLink } from '@/core/share/links';
import { hashToken, newToken } from '@/core/tokens';
import { slotId } from '@/lib/league/build-input';
import { scoreSchedule } from '@/lib/league/schedule';
import { isPublishable, type Game, type ScoreReport, type Slot } from '@/lib/league/types';
import { enqueue } from '@/modules/notifications/outbox';
import { PREVIEW } from '@/app/l/public-league';
import { isPlayoffKey, loadPlacedPlayoffs, playoffGame, playoffKey } from './bracket-load';
import { loadSeasonInput } from './load-input';
import { SCORED } from './rainout-load';

// Versions and pins (SCHED-02, GEN-06). Same permission as setup (D-27). A version's rows are never updated;
// publishing changes only status, reason and publishedAt (D-10). Publishing over an earlier published version
// queues one notice per team whose games changed slot (RAIN-04, D-18).
const PERM = 'org.update' as const;
const seasonPage = (slug: string, id: string) => `/o/${slug}/seasons/${id}`;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;

export const publish = orgAction(
  PERM,
  z.object({ versionId: ref('scheduleVersion'), reason: z.string().trim().min(1, 'Give a reason for publishing.').max(500, 'The reason is at most 500 characters.') }),
  async (ctx, i) => {
    const v = (await db.scheduleVersion.findFirst({ where: { id: i.versionId, ...inOrg(ctx) }, include: { season: { select: { name: true } } } })) ?? notFound();
    if (v.status !== 'draft') throw new Refused(`Version ${v.number} is ${v.status}; only a draft can be published.`);
    const r = v.report as unknown as ScoreReport;
    if (!isPublishable(r)) throw new Refused(`Version ${v.number} cannot be published: ${r.hardCount} hard violations and ${r.unplaced.length} unplaced games.`);

    // A draft can go stale between proposing and publishing: a slot closed, or a score entered, since it was made.
    const prev = await db.scheduleVersion.findFirst({ where: { seasonId: v.seasonId, status: 'published', ...inOrg(ctx) }, select: { id: true } });
    const team = { select: { id: true, name: true, contactEmail: true, divisionId: true, withdrawnAt: true } };
    const rows = await db.placement.findMany({
      where: { scheduleVersionId: { in: [v.id, ...(prev ? [prev.id] : [])] }, ...inOrg(ctx) },
      select: {
        scheduleVersionId: true,
        gameId: true,
        fieldSlotId: true,
        fieldSlot: { select: { day: true, start: true, fieldId: true, status: true, field: { select: { name: true } } } },
        game: { select: { key: true, round: true, leg: true, divisionId: true, homeTeam: team, awayTeam: team, results: { where: SCORED, select: { id: true }, take: 1 } } },
      },
    });
    const was = new Map(rows.filter((p) => p.scheduleVersionId === prev?.id).map((p) => [p.gameId, p]));
    const mine = rows.filter((p) => p.scheduleVersionId === v.id);
    const played = (p: (typeof rows)[number]) => p.game.results.length > 0;
    const closed = mine.filter((p) => p.fieldSlot.status === 'closed' && !played(p)).length;
    if (closed) throw new Refused(`Version ${v.number} puts ${closed} unplayed games in slots that are now closed. Propose a new version.`);
    const changes = prev ? mine.filter((p) => was.get(p.gameId)?.fieldSlotId !== p.fieldSlotId) : [];
    const rewritten = changes.filter(played).length;
    if (rewritten) throw new Refused(`Version ${v.number} moves ${rewritten} games that already have a score. Propose a new version.`);

    // BRKT-06: a playoff game may have taken a slot since the draft was made. The draft and every playoff game that
    // holds a slot are scored as one schedule, and a hard violation between one of each refuses (D-4).
    const playoffs = await loadPlacedPlayoffs(ctx, v.seasonId);
    if (playoffs.length) {
      const { input } = await loadSeasonInput(ctx, v.seasonId);
      const engineSlot = (s: { day: string; start: string; fieldId: string }): Slot => ({ id: slotId(s), day: s.day, start: s.start, field: s.fieldId });
      const games: Game[] = mine.map(({ game: g }) => ({ key: g.key, round: g.round, leg: g.leg === 2 ? 2 : 1, home: g.homeTeam.id, away: g.awayTeam.id, division: g.divisionId, ...(g.awayTeam.divisionId !== g.divisionId && { awayDivision: g.awayTeam.divisionId }) }));
      const held = [...mine.map((p) => [p.game.key, engineSlot(p.fieldSlot)] as const), ...playoffs.map((g) => [playoffKey(g), engineSlot(g.fieldSlot!)] as const)];
      const report = scoreSchedule(
        { games: [...games, ...playoffs.map(playoffGame)], slots: [...new Map(held.map(([, s]) => [s.id, s])).values()], blackouts: input.blackouts, rules: input.rules },
        Object.fromEntries(held.map(([key, s]) => [key, s.id])),
      );
      const clashes = report.hard.filter((h) => h.games.some(isPlayoffKey) && !h.games.every(isPlayoffKey));
      if (clashes.length) {
        const at = [...new Set(clashes.flatMap((h) => h.games.filter(isPlayoffKey)).map((key) => held.find(([k]) => k === key)![1]).map((s) => `${s.day} ${s.start}`))].sort();
        throw new Refused(`Version ${v.number} clashes with the playoff games placed on ${at.join(', ')}: a shared slot, or a team in two games. Propose a new version.`);
      }
    }

    // One notice per team, naming each of its games with the old slot and the new one.
    // WD-03: a game the previous version held and this one does not came off the schedule; a withdrawn team is not told.
    const where = (p: (typeof rows)[number]) => `${p.fieldSlot.day} ${p.fieldSlot.start} at ${p.fieldSlot.field.name}`;
    const kept = new Set(mine.map((p) => p.gameId));
    const removed = [...was.values()].filter((p) => !kept.has(p.gameId));
    const notices = new Map<string, { name: string; to: string | null; lines: string[] }>();
    const sorted = [...changes.map((p) => ({ p, now: where(p) })), ...removed.map((p) => ({ p, now: null }))].sort((a, b) => (where(a.p) < where(b.p) ? -1 : 1));
    for (const { p, now: at } of sorted) {
      const old = was.get(p.gameId);
      const line = `${p.game.homeTeam.name} v ${p.game.awayTeam.name}: was ${old ? where(old) : 'not scheduled'}, now ${at ?? 'off the schedule'}.`;
      for (const t of [p.game.homeTeam, p.game.awayTeam]) {
        if (!at && t.withdrawnAt) continue;
        if (!notices.has(t.id)) notices.set(t.id, { name: t.name, to: t.contactEmail, lines: [] });
        notices.get(t.id)!.lines.push(line);
      }
    }
    const reachable = [...notices.values()].filter((n) => n.to);
    try {
      await db.$transaction(async (tx) => {
        // The previous one first: the partial unique index allows one published version per season (D-10).
        await tx.scheduleVersion.updateMany({ where: { seasonId: v.seasonId, status: 'published', ...inOrg(ctx) }, data: { status: 'superseded' } });
        const done = await tx.scheduleVersion.updateMany({ where: { id: v.id, status: 'draft' }, data: { status: 'published', reason: i.reason, publishedAt: now() } });
        if (done.count !== 1) throw new Refused(`Version ${v.number} changed while publishing. Reload and try again.`);
        // In the same transaction, so a notice exists exactly when the publish does.
        for (const n of reachable) {
          await enqueue({ channel: 'email', to: n.to!, template: 'notice', orgId: ctx.orgId, data: { subject: `${v.season.name}: schedule change for ${n.name}`, body: `${i.reason}\n\n${n.lines.join('\n')}` } }, tx);
        }
        await audit(ctx, 'schedule.published', { targetType: 'scheduleVersion', targetId: v.id, data: { number: v.number, reason: i.reason, moved: changes.length, removed: removed.length, notices: reachable.length } }, tx);
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') throw new Refused('Another version was published at the same moment. Reload and try again.');
      throw e;
    }
    revalidatePath(seasonPage(ctx.slug, v.seasonId));
    const silent = notices.size - reachable.length;
    const off = removed.length ? ` and ${removed.length} came off the schedule` : '';
    const told = changes.length || removed.length ? ` ${changes.length} games changed slot${off}; ${reachable.length} team notices queued${silent ? `, ${silent} teams have no contact email` : ''}.` : '';
    return { notice: `Version ${v.number} is published.${told}` };
  },
);

export const setPin = orgAction(
  PERM,
  z.object({ seasonId: ref('season'), gameId: ref('game'), fieldSlotId: ref('fieldSlot') }),
  async (ctx, i) => {
    const { season, input } = await loadSeasonInput(ctx, i.seasonId);
    const game = (await db.game.findFirst({ where: { id: i.gameId, seasonId: season.id, ...inOrg(ctx) } })) ?? notFound();
    const slot = (await db.fieldSlot.findFirst({ where: { id: i.fieldSlotId, seasonId: season.id, ...inOrg(ctx) } })) ?? notFound();
    if (slot.status === 'closed') throw new Refused('That slot is closed.');
    if (!input.games.some((g) => g.key === game.key)) throw new Refused('That game is not in the current pairings.');

    // Illegal on its own is the scorer's answer (D-4): blackout, same-time or daily limit, against the other pins.
    const pinned = { ...input.pinned, [game.key]: slotId(slot) };
    const report = scoreSchedule({ ...input, pinned }, pinned);
    if (report.hardCount) {
      const names = new Map((await db.team.findMany({ where: { seasonId: season.id, ...inOrg(ctx) }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
      throw new Refused(`That pin is not legal: ${report.hard.map((h) => h.detail.replace(UUID, (m) => names.get(m) ?? m)).join(' ')}`);
    }
    try {
      await db.$transaction(async (tx) => {
        await tx.pin.create({ data: { ...inOrg(ctx), seasonId: season.id, gameId: game.id, fieldSlotId: slot.id } });
        await audit(ctx, 'pin.set', { targetType: 'game', targetId: game.id, data: { slot: slotId(slot) } }, tx);
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') throw new Refused('That game is already pinned, or another game holds that slot. Remove that pin first.');
      throw e;
    }
    revalidatePath(seasonPage(ctx.slug, season.id));
    return { notice: 'Pinned. The next generation works around it; versions already made are unchanged.' };
  },
);

export const removePin = orgAction(PERM, z.object({ seasonId: ref('season'), gameId: ref('game') }), async (ctx, i) => {
  const game = (await db.game.findFirst({ where: { id: i.gameId, seasonId: i.seasonId, ...inOrg(ctx) } })) ?? notFound();
  await db.$transaction(async (tx) => {
    await tx.pin.deleteMany({ where: { gameId: game.id, ...inOrg(ctx) } });
    await audit(ctx, 'pin.removed', { targetType: 'game', targetId: game.id }, tx);
  });
  revalidatePath(seasonPage(ctx.slug, i.seasonId));
  return { notice: 'Pin removed.' };
});

// PUB-13, D-53: a secret link to one draft as the public page would show it. A row of the template's ShareLink
// table, written here because `createShareLink` takes only the types registered in src/core: hashed at rest,
// expiry required, revoked through the template's own `revokeShareLink` (INV-07, INV-08).
export const previewLink = orgAction(PERM, z.object({ versionId: ref('scheduleVersion'), days: z.enum(['1', '7', '30']) }), async (ctx, i) => {
  const v = (await db.scheduleVersion.findFirst({ where: { id: i.versionId, ...inOrg(ctx) }, select: { id: true, number: true, status: true, seasonId: true } })) ?? notFound();
  if (v.status !== 'draft') throw new Refused(`Version ${v.number} is ${v.status}; only a draft has a preview.`);
  const token = newToken();
  await db.$transaction(async (tx) => {
    const link = await tx.shareLink.create({
      data: { ...inOrg(ctx), resourceType: PREVIEW, resourceId: v.id, tokenHash: hashToken(token), createdById: ctx.userId, expiresAt: new Date(now().getTime() + Number(i.days) * 86_400_000) },
    });
    await audit(ctx, 'share.created', { targetType: 'shareLink', targetId: link.id, data: { resourceType: PREVIEW, resourceId: v.id, days: Number(i.days) } }, tx);
  });
  revalidatePath(seasonPage(ctx.slug, v.seasonId));
  return { notice: `${env.APP_URL}/l/${ctx.slug}/${v.seasonId}/preview/${token}` }; // the raw token exists only in this response
});

export const revokePreview = orgAction(PERM, z.object({ id: ref('shareLink') }), async (ctx, i) => {
  // Only a preview link, and the season to go back to is read from it, never taken from the form.
  const link = (await db.shareLink.findFirst({ where: { id: i.id, resourceType: PREVIEW, ...inOrg(ctx) }, select: { resourceId: true } })) ?? notFound();
  const v = (await db.scheduleVersion.findFirst({ where: { id: link.resourceId, ...inOrg(ctx) }, select: { seasonId: true } })) ?? notFound();
  await revokeShareLink(ctx, i.id);
  redirect(seasonPage(ctx.slug, v.seasonId));
});
