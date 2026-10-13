import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { setCrossover } from '@/app/o/[org]/seasons/actions';
import { generate } from '@/app/o/[org]/seasons/generate-actions';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-013: generation through the real action. Four teams, one round robin = 6 games; six Tuesdays at one field.
const SLUG = 'league';
let seasonId: string;
let orgId: string;

async function league(teams: number, tuesdays: number) {
  const s = await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } });
  seasonId = s.id;
  const d = await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } });
  for (let i = 0; i < teams; i++) await db.team.create({ data: { orgId, seasonId, divisionId: d.id, name: `T${String(i).padStart(2, '0')}` } });
  const f = await db.field.create({ data: { orgId, name: 'F1' } });
  const days = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24'].slice(0, tuesdays);
  await db.fieldSlot.createMany({ data: days.flatMap((day) => ['18:00', '19:30'].map((start) => ({ orgId, seasonId, fieldId: f.id, day, start }))) });
}

beforeEach(async () => {
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  orgId = org.id;
  await signInAs((await addMember(org.id, 'owner', 'o@example.test')).id, { mfa: true });
});

describe('generate', () => {
  it('stores a draft with seed, hash, fingerprint, report and placements; the same seed reproduces it', async () => {
    await league(4, 6);
    const r = await generate(SLUG, { seasonId, seed: '42', maxIterations: '500' });
    expect(r).toMatchObject({ notice: expect.stringContaining('seed 42') });
    await generate(SLUG, { seasonId, seed: '42', maxIterations: '500' });
    const [v1, v2] = await db.scheduleVersion.findMany({ orderBy: { number: 'asc' } });
    expect([v1!.number, v2!.number]).toEqual([1, 2]);
    expect(v1).toMatchObject({ status: 'draft', seed: 42n, report: { hardCount: 0, before: expect.any(Object) } });
    expect(v2!.fingerprint).toBe(v1!.fingerprint);
    expect(v2!.inputHash).toBe(v1!.inputHash);
    expect(await db.game.count()).toBe(6); // games are created once, not per run
    expect(await db.placement.count({ where: { scheduleVersionId: v1!.id } })).toBe(6 - (v1!.report as { unplaced: string[] }).unplaced.length);
  });

  it('L-026: one crossover round adds a game for each team of the smaller division, stored under the home team\'s division', async () => {
    await league(4, 8);
    const rec = await db.division.create({ data: { orgId, seasonId, name: 'Rec', legs: 1 } });
    for (const name of ['R0', 'R1']) await db.team.create({ data: { orgId, seasonId, divisionId: rec.id, name } });
    const before = await generate(SLUG, { seasonId, seed: '7', maxIterations: '300' });
    expect(before).toMatchObject({ notice: expect.any(String) });
    expect(await db.game.count()).toBe(7); // 6 + 1, no crossover yet

    await setCrossover(SLUG, { seasonId, rounds: '1' });
    await generate(SLUG, { seasonId, seed: '7', maxIterations: '300' });
    const [v1, v2] = await db.scheduleVersion.findMany({ orderBy: { number: 'asc' } });
    expect(v2!.inputHash).not.toBe(v1!.inputHash); // the earlier draft is stale
    expect(v2!.report).toMatchObject({ hardCount: 0, unplaced: [] });
    const crossed = await db.game.findMany({ where: { key: { startsWith: 'X:' } }, include: { homeTeam: true, awayTeam: true } });
    expect(crossed).toHaveLength(2);
    for (const g of crossed) {
      expect(g.homeTeam.divisionId).not.toBe(g.awayTeam.divisionId);
      expect(g.divisionId).toBe(g.homeTeam.divisionId);
    }
    expect(await db.placement.count({ where: { scheduleVersionId: v2!.id } })).toBe(9);
  });

  it('a blank seed picks a new one and stores it', async () => {
    await league(4, 6);
    await generate(SLUG, { seasonId, seed: '', maxIterations: '100' });
    expect((await db.scheduleVersion.findFirstOrThrow()).seed).toBeGreaterThanOrEqual(0n);
  });

  it('refuses an infeasible season with the numbers, and stores nothing', async () => {
    await league(4, 1); // 2 slots for 6 games
    expect(await generate(SLUG, { seasonId, seed: '1', maxIterations: '100' })).toEqual({ error: expect.stringContaining('cannot fit') });
    expect(await db.scheduleVersion.count()).toBe(0);
  });

  it('refuses 17 teams and an iteration count over the cap, stating the limit', async () => {
    await league(17, 8);
    expect(await generate(SLUG, { seasonId, seed: '1', maxIterations: '100' })).toEqual({ error: 'Open has 17 teams; generation is limited to 16 per division.' });
    expect(await generate(SLUG, { seasonId, seed: '1', maxIterations: '10001' })).toEqual({ error: 'At most 10000 iterations.' });
  });

  it('answers not found for another org’s season', async () => {
    await league(4, 6);
    const other = await makeOrg('other');
    await signInAs((await addMember(other.id, 'owner', 'x@example.test')).id, { mfa: true });
    await expect(generate('other', { seasonId, seed: '1', maxIterations: '100' })).rejects.toThrow();
    expect(await db.scheduleVersion.count()).toBe(0);
  });
});
