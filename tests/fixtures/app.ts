import { db } from '@/core/db';

// CLONE-OWNED. The INV-01..04 harness seeds these rows in both fixture orgs, so it can drive
// actions whose inputs use ref('<model>') for the clone's own tables. Return { model: id } for
// one row of each model, owned by `org.orgId`.
const id = (key: 'a' | 'b', n: number) => `00000000-0000-4000-9000-${key === 'a' ? '1' : '2'}${String(n).padStart(11, '0')}`;

export async function seedApp(org: { orgId: string; userId: string }, key: 'a' | 'b'): Promise<Record<string, string>> {
  const ids = { season: id(key, 1), division: id(key, 2), team: id(key, 3), field: id(key, 4), fieldSlot: id(key, 5), team2: id(key, 6), game: id(key, 7), scheduleVersion: id(key, 8) };
  const base = { orgId: org.orgId };
  await db.season.create({
    data: { ...base, id: ids.season, name: `Season ${key}`, timezone: 'America/Chicago', firstDay: '2026-04-06', lastDay: '2026-06-26', gameMinutes: 90, rules: {}, standingsConfig: {} },
  });
  await db.division.create({ data: { ...base, id: ids.division, seasonId: ids.season, name: 'Open', legs: 1 } });
  await db.team.create({ data: { ...base, id: ids.team, seasonId: ids.season, divisionId: ids.division, name: `Team ${key}` } });
  await db.field.create({ data: { ...base, id: ids.field, name: `Field ${key}` } });
  await db.fieldSlot.create({ data: { ...base, id: ids.fieldSlot, seasonId: ids.season, day: '2026-04-07', start: '18:00', fieldId: ids.field } });
  // A game and an unpublishable draft, for the version and pin actions' refs.
  await db.team.create({ data: { ...base, id: ids.team2, seasonId: ids.season, divisionId: ids.division, name: `Team ${key} 2` } });
  await db.game.create({ data: { ...base, id: ids.game, seasonId: ids.season, divisionId: ids.division, key: 'L1:fixture', round: 1, leg: 1, homeTeamId: ids.team, awayTeamId: ids.team2 } });
  await db.scheduleVersion.create({
    data: { ...base, id: ids.scheduleVersion, seasonId: ids.season, number: 1, seed: 1n, inputHash: 'x', fingerprint: 'x', report: { hardCount: 1, softCost: 0, unplaced: [], hard: [], soft: [] }, iterations: 0, accepted: 0, createdBy: org.userId },
  });
  return ids;
}
