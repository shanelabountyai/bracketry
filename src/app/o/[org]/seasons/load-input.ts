import { notFound } from 'next/navigation';
import type { OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { buildInput, slotId } from '@/lib/league/build-input';
import type { Rules } from '@/lib/league/types';

/** One season's rows as the engine's input (D-24 slot ids). A season that is not this org's is "not found" (INV-04). */
export async function loadSeasonInput(ctx: Pick<OrgCtx, 'orgId'>, seasonId: string) {
  const org = { orgId: ctx.orgId }; // inOrg without a session: the public page has an org and no member (PUB-10)
  const season = (await db.season.findFirst({ where: { id: seasonId, ...org } })) ?? notFound();
  const [divisions, teams, slotRows, blackouts, pins] = await Promise.all([
    db.division.findMany({ where: { seasonId, ...org }, orderBy: { name: 'asc' } }),
    db.team.findMany({ where: { seasonId, ...org }, select: { id: true, divisionId: true } }),
    // A slot that holds a playoff game is not season inventory (BRKT-04).
    db.fieldSlot.findMany({ where: { seasonId, status: { in: ['open', 'makeup'] }, bracketGame: null, ...org } }),
    db.blackout.findMany({ where: { team: { seasonId }, ...org }, select: { teamId: true, day: true } }),
    db.pin.findMany({ where: { seasonId, ...org }, select: { game: { select: { key: true } }, fieldSlot: { select: { day: true, start: true, fieldId: true } } } }),
  ]);
  const rows = {
    divisions: divisions.map((d) => ({ id: d.id, name: d.name, legs: d.legs, teamIds: teams.filter((t) => t.divisionId === d.id).map((t) => t.id) })),
    slots: slotRows,
    blackouts,
    rules: season.rules as Partial<Rules>,
    pinned: Object.fromEntries(pins.map((p) => [p.game.key, slotId(p.fieldSlot)])),
    crossoverRounds: season.crossoverRounds,
  };
  return { season, rows, input: buildInput(rows), slotRowIds: new Map(slotRows.map((s) => [slotId(s), s.id])) };
}
