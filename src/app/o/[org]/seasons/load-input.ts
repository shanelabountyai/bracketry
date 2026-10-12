import { notFound } from 'next/navigation';
import { inOrg, type OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { buildInput, slotId } from '@/lib/league/build-input';
import type { Rules } from '@/lib/league/types';

/** One season's rows as the engine's input (D-24 slot ids). A season that is not this org's is "not found" (INV-04). */
export async function loadSeasonInput(ctx: OrgCtx, seasonId: string) {
  const season = (await db.season.findFirst({ where: { id: seasonId, ...inOrg(ctx) } })) ?? notFound();
  const [divisions, teams, slotRows, blackouts, pins] = await Promise.all([
    db.division.findMany({ where: { seasonId, ...inOrg(ctx) }, orderBy: { name: 'asc' } }),
    db.team.findMany({ where: { seasonId, ...inOrg(ctx) }, select: { id: true, divisionId: true } }),
    db.fieldSlot.findMany({ where: { seasonId, status: { in: ['open', 'makeup'] }, ...inOrg(ctx) } }),
    db.blackout.findMany({ where: { team: { seasonId }, ...inOrg(ctx) }, select: { teamId: true, day: true } }),
    db.pin.findMany({ where: { seasonId, ...inOrg(ctx) }, select: { game: { select: { key: true } }, fieldSlot: { select: { day: true, start: true, fieldId: true } } } }),
  ]);
  const rows = {
    divisions: divisions.map((d) => ({ id: d.id, name: d.name, legs: d.legs, teamIds: teams.filter((t) => t.divisionId === d.id).map((t) => t.id) })),
    slots: slotRows,
    blackouts,
    rules: season.rules as Partial<Rules>,
    pinned: Object.fromEntries(pins.map((p) => [p.game.key, slotId(p.fieldSlot)])),
  };
  return { season, rows, input: buildInput(rows), slotRowIds: new Map(slotRows.map((s) => [slotId(s), s.id])) };
}
