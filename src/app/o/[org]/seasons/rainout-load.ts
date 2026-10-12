import type { OrgCtx } from '@/core/authz/guards';
import { inOrg } from '@/core/authz/guards';
import { now } from '@/core/clock';
import { db } from '@/core/db';
import { slotId } from '@/lib/league/build-input';
import type { Assignment, ScheduleInput, Slot } from '@/lib/league/types';
import { loadSeasonInput } from './load-input';

/** 'YYYY-MM-DD' for an instant in an IANA zone. Explicit timeZone, so the process timezone never leaks in (D-6). */
export const dayIn = (tz: string, at: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);

/**
 * The published schedule as the rainout tool sees it (RAIN-01..05).
 *
 * A game is displaced when its slot is closed and it has no score. A game with a score was played: it is
 * never displaced and never moved, so its slot stays in the inventory even when closed.
 * The engine has no clock, so this is where the past is kept out (D-23): a free slot on or before today is
 * not offered; a slot that holds a game always stays.
 */
export async function loadRainout(ctx: OrgCtx, seasonId: string) {
  const base = await loadSeasonInput(ctx, seasonId);
  const { season, input } = base;
  const published = await db.scheduleVersion.findFirst({ where: { seasonId, status: 'published', ...inOrg(ctx) } });
  const placements = published
    ? await db.placement.findMany({
        where: { scheduleVersionId: published.id, ...inOrg(ctx) },
        select: { game: { select: { key: true, results: { select: { id: true }, take: 1 } } }, fieldSlot: { select: { id: true, day: true, start: true, fieldId: true, status: true } } },
      })
    : [];

  const today = dayIn(season.timezone, now());
  const current: Assignment = {};
  const played: Assignment = {};
  const displaced: { key: string; slot: string }[] = [];
  const closedPlayed: Slot[] = [];
  const slotRowIds = new Map(base.slotRowIds);
  for (const p of placements) {
    const id = slotId(p.fieldSlot);
    current[p.game.key] = id;
    slotRowIds.set(id, p.fieldSlot.id);
    const hasScore = p.game.results.length > 0;
    if (hasScore) played[p.game.key] = id;
    if (p.fieldSlot.status !== 'closed') continue;
    if (hasScore) closedPlayed.push({ id, day: p.fieldSlot.day, start: p.fieldSlot.start, field: p.fieldSlot.fieldId });
    else displaced.push({ key: p.game.key, slot: id });
  }
  displaced.sort((a, b) => (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : a.key < b.key ? -1 : 1));

  const usable = (holds: Set<string>) => [...input.slots.filter((s) => s.day > today || holds.has(s.id)), ...closedPlayed];
  const { games, blackouts, rules } = input;
  // Pins are left out of a reschedule: no other game moves anyway (D-12), and a displaced game's pin is void.
  const rescheduleInput: ScheduleInput = { games, blackouts, rules, slots: usable(new Set(Object.values(current))) };
  // RAIN-05: every played game is pinned where it was played; the commissioner's own pins still apply to the rest.
  const regenerateInput: ScheduleInput = { games, blackouts, rules, slots: usable(new Set(Object.values(played))), pinned: { ...input.pinned, ...played } };

  return { ...base, slotRowIds, published, today, current, played, displaced, rescheduleInput, regenerateInput };
}
