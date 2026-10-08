import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { makeOrg } from '../helpers/org';

// L-011: what the database refuses, whatever the app does (D-6, D-10, D-11, D-13). Every row here is written
// with raw SQL, so a refusal is the database's own and the assertion can name the constraint.

type Row = Record<string, string | number | null>;
const lit = (v: Row[string]) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${v.replace(/'/g, "''")}'`);

/** INSERT one row straight into `table`; returns its id. */
async function ins(table: string, row: Row): Promise<string> {
  const full = { id: randomUUID(), ...row };
  await db.$executeRawUnsafe(
    `INSERT INTO "${table}" (${Object.keys(full).map((k) => `"${k}"`).join(', ')}) VALUES (${Object.values(full).map(lit).join(', ')})`,
  );
  return full.id;
}
const sql = (q: string) => db.$executeRawUnsafe(q);
const count = async (table: string) => Number((await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table}"`))[0]!.n);

const USER = randomUUID();

/** One season with a division, three teams, a field, two slots, two games and two draft versions. */
async function league(orgId: string, name = 'Spring') {
  const seasonId = await ins('Season', { orgId, name, timezone: 'America/Chicago', firstDay: '2026-04-06', lastDay: '2026-06-28', gameMinutes: 60, rules: '{}', standingsConfig: '{}' });
  const divisionId = await ins('Division', { orgId, seasonId, name: 'A', legs: 1 });
  const team = (n: string) => ins('Team', { orgId, seasonId, divisionId, name: n });
  const [t1, t2, t3] = [await team('Tigers'), await team('Cubs'), await team('Owls')];
  const fieldId = await ins('Field', { orgId, name: `${name} Diamond` });
  const slot = (start: string) => ins('FieldSlot', { orgId, seasonId, day: '2026-04-07', start, fieldId });
  const [s1, s2] = [await slot('18:00'), await slot('19:00')];
  const game = (key: string, home: string, away: string) => ins('Game', { orgId, seasonId, divisionId, key, round: 1, leg: 1, homeTeamId: home, awayTeamId: away });
  const [g1, g2] = [await game('L1:a~b', t1, t2), await game('L1:a~c', t1, t3)];
  const version = (number: number, status = 'draft') =>
    ins('ScheduleVersion', { orgId, seasonId, number, seed: 7, inputHash: 'h', fingerprint: 'f', status, report: '{}', iterations: 0, accepted: 0, createdBy: USER });
  const [v1, v2] = [await version(1), await version(2)];
  const place = (scheduleVersionId: string, gameId: string, fieldSlotId: string) => ins('Placement', { orgId, seasonId, scheduleVersionId, gameId, fieldSlotId });
  const result = (gameId: string, extra: Row = {}) => ins('GameResult', { orgId, gameId, homeRuns: 5, awayRuns: 3, enteredBy: USER, ...extra });
  return { orgId, seasonId, divisionId, t1, t2, t3, fieldId, s1, s2, g1, g2, v1, v2, version, place, result };
}

let L: Awaited<ReturnType<typeof league>>;
// Every league row hangs off an org, so deleting the orgs empties all fifteen tables through the cascade the
// append-only triggers allow. A TRUNCATE of fifteen non-empty tables cost about a second per test here.
beforeEach(async () => {
  await db.org.deleteMany();
  L = await league((await makeOrg()).id);
});

describe('D-11 one game per slot, one placement per game, within a version', () => {
  it('refuses a second game in a slot', async () => {
    await L.place(L.v1, L.g1, L.s1);
    await expect(L.place(L.v1, L.g2, L.s1)).rejects.toThrow(/Placement_scheduleVersionId_fieldSlotId_key/);
  });

  it('refuses a second placement of a game', async () => {
    await L.place(L.v1, L.g1, L.s1);
    await expect(L.place(L.v1, L.g1, L.s2)).rejects.toThrow(/Placement_scheduleVersionId_gameId_key/);
  });

  it('allows the same game and slot in another version', async () => {
    await L.place(L.v1, L.g1, L.s1);
    await L.place(L.v2, L.g1, L.s1);
    expect(await count('Placement')).toBe(2);
  });

  it('refuses a placement that joins another season’s slot, game or version', async () => {
    const other = await league(L.orgId, 'Fall');
    await expect(L.place(L.v1, L.g1, other.s1)).rejects.toThrow(/Placement_fieldSlotId_seasonId_fkey/);
    await expect(L.place(L.v1, other.g1, L.s1)).rejects.toThrow(/Placement_gameId_seasonId_fkey/);
    await expect(L.place(other.v1, L.g1, L.s1)).rejects.toThrow(/Placement_scheduleVersionId_seasonId_fkey/);
  });
});

describe('D-10 one published version per season', () => {
  const publish = (id: string) => sql(`UPDATE "ScheduleVersion" SET "status" = 'published', "publishedAt" = now() WHERE "id" = '${id}'`);

  it('refuses a second published version, by UPDATE and by INSERT', async () => {
    await publish(L.v1);
    await expect(publish(L.v2)).rejects.toThrow(/ScheduleVersion_one_published_per_season/);
    await expect(L.version(3, 'published')).rejects.toThrow(/ScheduleVersion_one_published_per_season/);
  });

  it('allows the next version once the previous one is superseded', async () => {
    await publish(L.v1);
    await sql(`UPDATE "ScheduleVersion" SET "status" = 'superseded' WHERE "id" = '${L.v1}'`);
    await publish(L.v2);
    const rows = await db.$queryRawUnsafe<{ number: number; status: string }[]>(`SELECT "number", "status"::text FROM "ScheduleVersion" WHERE "seasonId" = '${L.seasonId}' ORDER BY "number"`);
    expect(rows).toEqual([{ number: 1, status: 'superseded' }, { number: 2, status: 'published' }]);
  });

  it('allows a published version in each of two seasons', async () => {
    const other = await league(L.orgId, 'Fall');
    await publish(L.v1);
    await publish(other.v1);
  });

  it('refuses a reused version number and a seed outside uint32', async () => {
    await expect(L.version(2)).rejects.toThrow(/ScheduleVersion_seasonId_number_key/);
    await expect(ins('ScheduleVersion', { orgId: L.orgId, seasonId: L.seasonId, number: 9, seed: 4294967296, inputHash: 'h', fingerprint: 'f', report: '{}', iterations: 0, accepted: 0, createdBy: USER })).rejects.toThrow(/ScheduleVersion_seed_uint32/);
  });
});

describe('D-13 results and tie resolutions are append-only', () => {
  it('refuses UPDATE and DELETE on GameResult', async () => {
    await L.result(L.g1);
    await expect(sql(`UPDATE "GameResult" SET "homeRuns" = 99`)).rejects.toThrow(/GameResult is append-only/);
    await expect(sql(`DELETE FROM "GameResult"`)).rejects.toThrow(/GameResult is append-only/);
    await expect(db.gameResult.deleteMany()).rejects.toThrow(/append-only/);
    expect((await db.gameResult.findFirstOrThrow()).homeRuns).toBe(5);
  });

  it('refuses UPDATE and DELETE on TieResolution', async () => {
    await ins('TieResolution', { orgId: L.orgId, divisionId: L.divisionId, teamIds: JSON.stringify([L.t1, L.t2]), method: 'coin flip', decidedBy: USER });
    await expect(sql(`UPDATE "TieResolution" SET "method" = 'forged'`)).rejects.toThrow(/TieResolution is append-only/);
    await expect(sql(`DELETE FROM "TieResolution"`)).rejects.toThrow(/TieResolution is append-only/);
    expect(await count('TieResolution')).toBe(1);
  });

  it('lets a cascade from the org remove them', async () => {
    await L.result(L.g1);
    await ins('TieResolution', { orgId: L.orgId, divisionId: L.divisionId, teamIds: '[]', method: 'coin flip', decidedBy: USER });
    await sql(`DELETE FROM "Org" WHERE "id" = '${L.orgId}'`);
    expect([await count('GameResult'), await count('TieResolution'), await count('Season')]).toEqual([0, 0, 0]);
  });

  it('keeps one linear correction chain per game', async () => {
    const first = await L.result(L.g1);
    await expect(L.result(L.g1)).rejects.toThrow(/GameResult_one_original_per_game/);
    const second = await L.result(L.g1, { supersedesId: first, reason: 'scorebook misread' });
    await expect(L.result(L.g1, { supersedesId: first })).rejects.toThrow(/GameResult_supersedesId_key/);
    await L.result(L.g1, { supersedesId: second });
    const current = await db.$queryRawUnsafe<{ id: string }[]>(
      `SELECT r."id" FROM "GameResult" r WHERE r."gameId" = '${L.g1}' AND NOT EXISTS (SELECT 1 FROM "GameResult" s WHERE s."supersedesId" = r."id")`,
    );
    expect(current).toHaveLength(1);
  });

  it('refuses a correction that supersedes another game’s result, and negative runs', async () => {
    const first = await L.result(L.g1);
    await expect(L.result(L.g2, { supersedesId: first })).rejects.toThrow(/GameResult_supersedesId_gameId_fkey/);
    await expect(L.result(L.g2, { homeRuns: -1 })).rejects.toThrow(/GameResult_runs_nonnegative/);
  });
});

describe('pins and playoff slots', () => {
  const pin = (gameId: string, fieldSlotId: string, seasonId = L.seasonId) => ins('Pin', { orgId: L.orgId, seasonId, gameId, fieldSlotId });

  it('refuses two pins on one game, two games pinned to one slot, and a cross-season pin', async () => {
    const other = await league(L.orgId, 'Fall');
    await pin(L.g1, L.s1);
    await expect(pin(L.g1, L.s2)).rejects.toThrow(/Pin_gameId_key/);
    await expect(pin(L.g2, L.s1)).rejects.toThrow(/Pin_fieldSlotId_key/);
    await expect(pin(L.g2, other.s2)).rejects.toThrow(/Pin_fieldSlotId_seasonId_fkey/);
  });

  it('refuses a second bracket for a division, a repeated match id, and two playoff games in one slot', async () => {
    const bracket = () => ins('Bracket', { orgId: L.orgId, divisionId: L.divisionId, size: 4, seeding: '[]', standingsFingerprint: 'f', createdBy: USER });
    const bracketId = await bracket();
    await expect(bracket()).rejects.toThrow(/Bracket_divisionId_key/);
    const match = (matchId: string, index: number, fieldSlotId: string | null) => ins('BracketGame', { orgId: L.orgId, bracketId, matchId, round: 1, index, fieldSlotId });
    await match('R1M1', 1, L.s1);
    await expect(match('R1M1', 1, null)).rejects.toThrow(/BracketGame_bracketId_matchId_key/);
    await expect(match('R1M2', 2, L.s1)).rejects.toThrow(/BracketGame_fieldSlotId_key/);
    await match('R1M2', 2, null);
    await match('R2M1', 1, null); // unscheduled games do not collide
  });
});

describe('§8 unique rows', () => {
  it('refuses each duplicate', async () => {
    const { orgId, seasonId, divisionId, t1, t2, fieldId } = L;
    await expect(ins('Team', { orgId, seasonId, divisionId, name: 'Tigers' })).rejects.toThrow(/Team_seasonId_name_key/);
    await expect(ins('Division', { orgId, seasonId, name: 'A', legs: 2 })).rejects.toThrow(/Division_seasonId_name_key/);
    await expect(ins('Field', { orgId, name: 'Spring Diamond' })).rejects.toThrow(/Field_orgId_name_key/);
    await expect(ins('FieldSlot', { orgId, seasonId, day: '2026-04-07', start: '18:00', fieldId })).rejects.toThrow(/FieldSlot_seasonId_day_start_fieldId_key/);
    await expect(ins('Game', { orgId, seasonId, divisionId, key: 'L1:a~b', round: 2, leg: 1, homeTeamId: t2, awayTeamId: t1 })).rejects.toThrow(/Game_seasonId_key_key/);
    await ins('Blackout', { orgId, teamId: t1, day: '2026-04-07' });
    await expect(ins('Blackout', { orgId, teamId: t1, day: '2026-04-07' })).rejects.toThrow(/Blackout_teamId_day_key/);
    await ins('SlotPattern', { orgId, seasonId, weekday: 2, start: '18:00', fieldId });
    await expect(ins('SlotPattern', { orgId, seasonId, weekday: 2, start: '18:00', fieldId })).rejects.toThrow(/SlotPattern_seasonId_weekday_start_fieldId_key/);
  });
});

describe('D-6 days and wall times, and the small ranges', () => {
  it('refuses a value CHAR(n) would otherwise pad or accept', async () => {
    const { orgId, seasonId, divisionId, t1, fieldId } = L;
    const season = (firstDay: string, lastDay: string) => ins('Season', { orgId, name: 'x', timezone: 'UTC', firstDay, lastDay, gameMinutes: 60, rules: '{}', standingsConfig: '{}' });
    await expect(season('2026-4-6', '2026-06-28')).rejects.toThrow(/Season_firstDay_shape/);
    await expect(season('2026-04-06', '06/28/2026')).rejects.toThrow(/Season_lastDay_shape/);
    await expect(ins('FieldSlot', { orgId, seasonId, day: '2026-4-7', start: '18:00', fieldId })).rejects.toThrow(/FieldSlot_day_shape/);
    await expect(ins('FieldSlot', { orgId, seasonId, day: '2026-04-08', start: '6:00', fieldId })).rejects.toThrow(/FieldSlot_start_shape/);
    await expect(ins('Blackout', { orgId, teamId: t1, day: 'Apr 7' })).rejects.toThrow(/Blackout_day_shape/);
    await expect(ins('SlotPattern', { orgId, seasonId, weekday: 2, start: '6pm', fieldId })).rejects.toThrow(/SlotPattern_start_shape/);
    await expect(ins('SlotPattern', { orgId, seasonId, weekday: 7, start: '18:00', fieldId })).rejects.toThrow(/SlotPattern_weekday_range/);
    await expect(ins('Division', { orgId, seasonId, name: 'B', legs: 3 })).rejects.toThrow(/Division_legs_range/);
    const game = (leg: number, away: string) => ins('Game', { orgId, seasonId, divisionId, key: `k${leg}${away}`, round: 1, leg, homeTeamId: t1, awayTeamId: away });
    await expect(game(3, L.t2)).rejects.toThrow(/Game_leg_range/);
    await expect(game(1, t1)).rejects.toThrow(/Game_two_teams/);
  });

  it('reads a day and a time back as the strings that were written', async () => {
    const slot = await db.fieldSlot.findFirstOrThrow({ where: { id: L.s1 } });
    expect([slot.day, slot.start]).toEqual(['2026-04-07', '18:00']);
  });
});
