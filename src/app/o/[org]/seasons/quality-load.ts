import type { OrgCtx } from '@/core/authz/guards';
import { db } from '@/core/db';
import { slotId } from '@/lib/league/build-input';
import { scheduleQuality } from '@/lib/league/quality';
import type { Assignment, ScoreReport, Slot } from '@/lib/league/types';
import { loadSeasonInput } from './load-input';

/**
 * One version's quality table (QUAL-01, QUAL-02). `number` undefined = the newest version.
 *
 * Counted against the season as it is now, plus any slot the version uses that has since been closed or
 * given to a playoff game. `stored` is the score saved when the version was made; when the two differ the
 * season's inputs changed in between, and the page says so.
 */
export async function loadQuality(ctx: Pick<OrgCtx, 'orgId'>, seasonId: string, number?: number) {
  const org = { orgId: ctx.orgId }; // inOrg without a session: the public page has an org and no member (PUB-10)
  const { season, input } = await loadSeasonInput(ctx, seasonId);
  const versions = await db.scheduleVersion.findMany({ where: { seasonId, ...org }, orderBy: { number: 'desc' }, select: { id: true, number: true, status: true, report: true } });
  const version = number === undefined ? versions[0] : versions.find((v) => v.number === number);
  if (!version) return { season, versions, version: null };
  const [placements, teams, divisions, fields] = await Promise.all([
    db.placement.findMany({ where: { scheduleVersionId: version.id, ...org }, select: { game: { select: { key: true } }, fieldSlot: { select: { day: true, start: true, fieldId: true } } } }),
    db.team.findMany({ where: { seasonId, ...org }, select: { id: true, name: true } }),
    db.division.findMany({ where: { seasonId, ...org }, select: { id: true, name: true } }),
    db.field.findMany({ where: org, select: { id: true, name: true } }),
  ]);
  const assignment: Assignment = {};
  const slots = new Map<string, Slot>(input.slots.map((s) => [s.id, s]));
  for (const p of placements) {
    const id = slotId(p.fieldSlot);
    assignment[p.game.key] = id;
    if (!slots.has(id)) slots.set(id, { id, day: p.fieldSlot.day, start: p.fieldSlot.start, field: p.fieldSlot.fieldId });
  }
  const quality = scheduleQuality({ ...input, slots: [...slots.values()] }, assignment);
  const names = new Map([...teams, ...divisions, ...fields].map((x) => [x.id, x.name]));
  return { season, versions, version, quality, stored: version.report as unknown as ScoreReport, name: (id: string) => names.get(id) ?? '?' };
}
