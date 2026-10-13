import { beforeEach, describe, expect, it } from 'vitest';
import { advanceClock } from '@/core/clock';
import { db } from '@/core/db';
import { generate } from '@/app/o/[org]/seasons/generate-actions';
import { timeIn } from '@/app/o/[org]/seasons/rainout-load';
import { recordResult } from '@/app/o/[org]/seasons/result-actions';
import { publish } from '@/app/o/[org]/seasons/version-actions';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-015: score entry. Four teams, six games, Tuesdays from 2026-10-06 at 18:00 and 19:30 (America/Chicago).
const SLUG = 'league';
let orgId: string;
let seasonId: string;

beforeEach(async () => {
  advanceClock(0);
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  orgId = org.id;
  await signInAs((await addMember(org.id, 'owner', 'o@example.test')).id, { mfa: true });
  const s = await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } });
  seasonId = s.id;
  const d = await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } });
  for (let i = 0; i < 4; i++) await db.team.create({ data: { orgId, seasonId, divisionId: d.id, name: `T${i}` } });
  const f = await db.field.create({ data: { orgId, name: 'F1' } });
  const days = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
  await db.fieldSlot.createMany({ data: days.flatMap((day) => ['18:00', '19:30'].map((start) => ({ orgId, seasonId, fieldId: f.id, day, start }))) });
});

const placedGame = async (day: string) => (await db.placement.findFirstOrThrow({ where: { fieldSlot: { day } }, select: { gameId: true } })).gameId;
const publishOne = async () => {
  await generate(SLUG, { seasonId, seed: '1', maxIterations: '300' });
  await publish(SLUG, { versionId: (await db.scheduleVersion.findFirstOrThrow()).id, reason: 'Go' });
};
const ms = (iso: string) => new Date(iso).getTime() - Date.now();

describe('recordResult', () => {
  it('refuses a game not in the published version', async () => {
    await generate(SLUG, { seasonId, seed: '1', maxIterations: '300' });
    const g = await db.game.findFirstOrThrow();
    expect(await recordResult(SLUG, { gameId: g.id, homeRuns: '3', awayRuns: '2' })).toEqual({ error: expect.stringContaining('not in the published schedule') });
  });

  it('refuses a future game and accepts it once the season-timezone day arrives', async () => {
    await publishOne();
    const g = await placedGame('2026-10-13');
    advanceClock(ms('2026-10-13T04:59:00Z')); // still Oct 12 in Chicago (CDT, UTC-5)
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '3', awayRuns: '2' })).toEqual({ error: expect.stringContaining('on or before today') });
    advanceClock(ms('2026-10-13T05:00:00Z'));
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '3', awayRuns: '2' })).toEqual({ notice: 'Score saved.' });
  });

  it('refuses a second score unless it is a correction with a reason, and keeps the history', async () => {
    await publishOne();
    const g = await placedGame('2026-10-06');
    await recordResult(SLUG, { gameId: g, homeRuns: '3', awayRuns: '2' });
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '4', awayRuns: '2' })).toEqual({ error: expect.stringContaining('Mark this one as a correction') });
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '4', awayRuns: '2', correction: 'on' })).toEqual({ error: 'Give a reason for the correction.' });
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '4', awayRuns: '2', correction: 'on', reason: 'Scorebook error' })).toEqual({ notice: expect.stringContaining('Correction saved') });
    await recordResult(SLUG, { gameId: g, homeRuns: '5', awayRuns: '2', correction: 'on', reason: 'Again' }); // corrects the correction
    const rows = await db.gameResult.findMany({ where: { gameId: g }, orderBy: { enteredAt: 'asc' } });
    expect(rows.map((r) => r.homeRuns)).toEqual([3, 4, 5]);
    expect(rows[1]!.supersedesId).toBe(rows[0]!.id);
    expect(rows[2]!.supersedesId).toBe(rows[1]!.id);
  });

  it('refuses a correction with nothing to correct, and stores a forfeit as 0-0', async () => {
    await publishOne();
    const g = await placedGame('2026-10-06');
    expect(await recordResult(SLUG, { gameId: g, correction: 'on', reason: 'x' })).toEqual({ error: 'There is no score to correct yet.' });
    await recordResult(SLUG, { gameId: g, homeRuns: '9', awayRuns: '1', forfeit: 'away' });
    expect(await db.gameResult.findFirstOrThrow({ where: { gameId: g } })).toMatchObject({ homeRuns: 0, awayRuns: 0, forfeit: 'away', supersedesId: null });
  });

  it('refuses an untouched form instead of saving 0-0, and still takes a forfeit with empty boxes (SCORE-04)', async () => {
    await publishOne();
    const g = await placedGame('2026-10-06');
    const refused = { error: 'Enter the runs for both teams, or choose a forfeit.' };
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '', awayRuns: '', forfeit: '' })).toEqual(refused);
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '3', awayRuns: '' })).toEqual(refused);
    expect(await recordResult(SLUG, { gameId: g })).toEqual(refused);
    expect(await db.gameResult.count()).toBe(0);
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '0', awayRuns: '0' })).toEqual({ notice: 'Score saved.' }); // a typed 0-0 is a real tie
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '', awayRuns: '', forfeit: 'home', correction: 'on', reason: 'No-show' })).toEqual({ notice: expect.stringContaining('Correction saved') });
  });

  it('shows an instant in league time (SCORE-08)', () => {
    expect(timeIn('America/Chicago', new Date('2026-10-07T01:30:00Z'))).toBe('2026-10-06 20:30');
  });

  it('refuses negative or non-numeric runs', async () => {
    await publishOne();
    const g = await placedGame('2026-10-06');
    expect(await recordResult(SLUG, { gameId: g, homeRuns: '-1', awayRuns: '2' })).toEqual({ error: 'Runs cannot be negative.' });
    expect(await recordResult(SLUG, { gameId: g, homeRuns: 'x', awayRuns: '2' })).toEqual({ error: 'Runs must be a whole number.' });
  });
});
