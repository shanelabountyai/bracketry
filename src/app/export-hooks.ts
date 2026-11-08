import { moduleExportTables } from '@/app/modules';
import type { ExportTable } from '@/core/tenancy/export';

// Clone-owned (v1.6.0), like org-hooks.ts: which tables a data export holds beyond the template's core ones
// (addendum §5). Add one entry per org-owned table, selecting only columns that are safe to hand over: never a
// sealed column, token hash or recovery code (INV-34 scans the output). Every query runs inside withOrg.
//   { name: 'Booking', rows: (tx, orgId) => tx.booking.findMany({ where: { orgId }, select: { id: true, startsAt: true } }) },
export const exportTables: readonly ExportTable[] = [
  ...moduleExportTables,
  // bracketry (D-57): whole rows; no league table holds a secret, token or credential.
  { name: 'Season', rows: (tx, orgId) => tx.season.findMany({ where: { orgId } }) },
  { name: 'Division', rows: (tx, orgId) => tx.division.findMany({ where: { orgId } }) },
  { name: 'Team', rows: (tx, orgId) => tx.team.findMany({ where: { orgId } }) },
  { name: 'Field', rows: (tx, orgId) => tx.field.findMany({ where: { orgId } }) },
  { name: 'SlotPattern', rows: (tx, orgId) => tx.slotPattern.findMany({ where: { orgId } }) },
  { name: 'FieldSlot', rows: (tx, orgId) => tx.fieldSlot.findMany({ where: { orgId } }) },
  { name: 'Blackout', rows: (tx, orgId) => tx.blackout.findMany({ where: { orgId } }) },
  { name: 'Game', rows: (tx, orgId) => tx.game.findMany({ where: { orgId } }) },
  { name: 'Pin', rows: (tx, orgId) => tx.pin.findMany({ where: { orgId } }) },
  { name: 'ScheduleVersion', rows: (tx, orgId) => tx.scheduleVersion.findMany({ where: { orgId } }) },
  { name: 'Placement', rows: (tx, orgId) => tx.placement.findMany({ where: { orgId } }) },
  { name: 'GameResult', rows: (tx, orgId) => tx.gameResult.findMany({ where: { orgId } }) },
  { name: 'TieResolution', rows: (tx, orgId) => tx.tieResolution.findMany({ where: { orgId } }) },
  { name: 'Bracket', rows: (tx, orgId) => tx.bracket.findMany({ where: { orgId } }) },
  { name: 'BracketGame', rows: (tx, orgId) => tx.bracketGame.findMany({ where: { orgId } }) },
];

// An org-owned table left out on purpose, with the reason. INV-34 fails on any model with an orgId column that is in
// neither list, so a new table cannot silently drop out of every export.
export const exportSkipped: Readonly<Record<string, string>> = {};
