'use server';
import { randomInt } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { audit } from '@/core/audit';
import { orgAction, ref } from '@/core/authz/action';
import { inOrg } from '@/core/authz/guards';
import { db } from '@/core/db';
import { Refused } from '@/core/errors';
import { compareAssignments } from '@/lib/league/compare';
import { dayNumber } from '@/lib/league/days';
import { generateSchedule, reschedule } from '@/lib/league/schedule';
import { whyUnplaced } from '@/lib/league/unplaced';
import { loadRainout, SCORED } from './rainout-load';
import { saveDraft } from './save-draft';

// Rainout tool (RAIN-01..05). Same permission as setup (D-27). Nothing here touches a published version:
// both actions end in a new draft, and notices go out when that draft is published (D-18, version-actions.ts).
const PERM = 'org.update' as const;
const seasonPage = (slug: string, id: string) => `/o/${slug}/seasons/${id}`;

/** RAIN-01: close every open or makeup slot on one day. Pins on those slots are removed: a pin to a closed slot can never be met. */
export const closeDay = orgAction(PERM, z.object({ seasonId: ref('season'), day: z.string() }), async (ctx, i) => {
  const s = (await db.season.findFirst({ where: { id: i.seasonId, ...inOrg(ctx) }, select: { id: true } })) ?? notFound();
  try {
    dayNumber(i.day);
  } catch {
    throw new Refused('Enter a real day as YYYY-MM-DD.');
  }
  const onDay = { seasonId: s.id, day: i.day, ...inOrg(ctx) };
  const r = await db.$transaction(async (tx) => {
    const closed = await tx.fieldSlot.updateMany({ where: { ...onDay, status: { not: 'closed' } }, data: { status: 'closed' } });
    if (!closed.count) throw new Refused(`No open slots on ${i.day}.`);
    const pins = await tx.pin.deleteMany({ where: { fieldSlot: onDay } });
    await audit(ctx, 'slots.closed', { targetType: 'season', targetId: s.id, data: { day: i.day, slots: closed.count, pinsRemoved: pins.count } }, tx);
    return { slots: closed.count, pins: pins.count };
  });
  const displaced = await db.placement.count({ where: { scheduleVersion: { status: 'published' }, fieldSlot: onDay, game: { results: { none: SCORED } }, ...inOrg(ctx) } });
  revalidatePath(seasonPage(ctx.slug, s.id));
  return { notice: `Closed ${r.slots} slots on ${i.day}.${r.pins ? ` Removed ${r.pins} pins that pointed at them.` : ''} ${displaced} published games are displaced.` };
});

/** RAIN-02, RAIN-03: a draft in which only the displaced games have moved (D-12). */
export const proposeReschedule = orgAction(PERM, z.object({ seasonId: ref('season') }), async (ctx, i) => {
  const r = await loadRainout(ctx, i.seasonId);
  if (!r.published) throw new Refused('Publish a version first. A reschedule starts from the published schedule.');
  if (!r.displaced.length) throw new Refused('No unplayed game sits in a closed slot, so there is nothing to reschedule.');

  const out = reschedule({ input: r.rescheduleInput, current: r.current, removedSlotIds: r.displaced.map((d) => d.slot), seed: 0 });
  // D-12 is the point of this action, so it is checked on every run, not only in the engine's tests.
  const displaced = new Set(r.displaced.map((d) => d.key));
  const stray = compareAssignments(r.current, out.assignment).filter((m) => !displaced.has(m.key));
  if (stray.length) throw new Error(`reschedule moved games that were not displaced (D-12): ${stray.map((m) => m.key).join(', ')}`);

  const unplaced = Object.fromEntries(out.unplaced.map((key) => [key, whyUnplaced(r.rescheduleInput, out.assignment, key)]));
  const number = await saveDraft(ctx, r.season.id, {
    input: r.rescheduleInput,
    assignment: out.assignment,
    slotRowIds: r.slotRowIds,
    seed: 0, // spec 01 §7 makes no random choice
    report: { ...out.report, reschedule: { of: r.published.number, moved: out.moved, unplaced } },
    iterations: 0,
    accepted: 0,
    action: 'schedule.rescheduled',
  });
  revalidatePath(seasonPage(ctx.slug, r.season.id));
  return { notice: `Draft version ${number}: ${out.moved.length} of ${displaced.size} displaced games moved, ${out.unplaced.length} have no legal slot. Every other game kept its slot.` };
});

/** RAIN-05: a full regeneration around the games already played. Deliberately separate from the reschedule. */
export const regenerateRest = orgAction(
  PERM,
  z.object({ seasonId: ref('season'), confirm: z.literal('on', 'Tick the box to confirm that unplayed games may move.') }),
  async (ctx, i) => {
    const r = await loadRainout(ctx, i.seasonId);
    if (!r.published) throw new Refused('Publish a version first. There is no season in progress to regenerate.');
    const seed = randomInt(2 ** 32);
    const result = generateSchedule(r.regenerateInput, { seed });
    const kept = Object.keys(r.played).length;
    const unplayed = r.regenerateInput.games.length - kept;
    const moved = compareAssignments(r.current, result.assignment).length;
    const b = result.before;
    const number = await saveDraft(ctx, r.season.id, {
      input: r.regenerateInput,
      assignment: result.assignment,
      slotRowIds: r.slotRowIds,
      seed,
      report: { ...result.report, before: { hardCount: b.hardCount, unplaced: b.unplaced.length, softCost: b.softCost }, regenerated: { of: r.published.number, kept, unplayed, moved } },
      iterations: result.iterations,
      accepted: result.accepted,
      action: 'schedule.regenerated',
    });
    revalidatePath(seasonPage(ctx.slug, r.season.id));
    return { notice: `Draft version ${number} keeps the ${kept} played games and moves ${moved} of the ${unplayed} unplayed games (${result.report.unplaced.length} unplaced). Compare it with version ${r.published.number} before publishing.` };
  },
);
