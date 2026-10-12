import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/core/db';
import { NavSignal } from '../helpers/next';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';
import { addBlackout, addDivision, addField, addHoliday, addSeason, addSlot, addSlotPattern, addTeam, saveRules, setSlotOpen } from '@/app/o/[org]/seasons/actions';

// L-012: season setup through the real actions. Window 2026-10-05 (Mon) to 2026-10-18 (Sun): two Tuesdays.
const SLUG = 'league';
let seasonId: string;

beforeEach(async () => {
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  await signInAs((await addMember(org.id, 'owner', 'o@example.test')).id, { mfa: true });
  const redirected = await addSeason(SLUG, { name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-10-18', gameMinutes: 60 }).catch((e: NavSignal) => e);
  seasonId = (redirected as NavSignal).to!.split('/').pop()!;
});

const slots = () => db.fieldSlot.findMany({ orderBy: [{ day: 'asc' }, { start: 'asc' }] });

describe('season setup', () => {
  it('starts with default rules and refuses a backwards window', async () => {
    expect(await db.season.findUniqueOrThrow({ where: { id: seasonId } })).toMatchObject({ status: 'setup', rules: { maxGamesPerTeamPerDay: 1, weights: { rest: 10 } } });
    expect(await addSeason(SLUG, { name: 'X', timezone: 'America/Chicago', firstDay: '2026-10-18', lastDay: '2026-10-05', gameMinutes: 60 })).toEqual({ error: 'The last day cannot be before the first day.' });
  });

  it('materializes a weekly pattern, and a rerun adds nothing', async () => {
    await addField(SLUG, { seasonId, name: 'Field 1' });
    const field = await db.field.findFirstOrThrow();
    await addSlotPattern(SLUG, { seasonId, fieldId: field.id, weekday: 2, start: '18:00' });
    expect((await slots()).map((s) => s.day)).toEqual(['2026-10-06', '2026-10-13']);
    expect(await addSlotPattern(SLUG, { seasonId, fieldId: field.id, weekday: 2, start: '18:00' })).toEqual({ error: 'That weekly slot already exists.' });
    expect(await slots()).toHaveLength(2);
  });

  it('closes, reopens, adds by hand, and maps duplicate and out-of-window', async () => {
    await addField(SLUG, { seasonId, name: 'Field 1' });
    const f = (await db.field.findFirstOrThrow()).id;
    await addSlot(SLUG, { seasonId, fieldId: f, day: '2026-10-07', start: '19:00' });
    expect(await addSlot(SLUG, { seasonId, fieldId: f, day: '2026-10-07', start: '19:00' })).toEqual({ error: 'That slot already exists.' });
    expect(await addSlot(SLUG, { seasonId, fieldId: f, day: '2026-11-01', start: '19:00' })).toEqual({ error: 'That day is outside the season.' });
    const id = (await slots())[0]!.id;
    await setSlotOpen(SLUG, { id, open: 'false' });
    expect((await slots())[0]!.status).toBe('closed');
    expect(await setSlotOpen(SLUG, { id, open: 'false' })).toEqual({ error: 'That slot is not open.' });
    await setSlotOpen(SLUG, { id, open: 'true' });
    expect((await slots())[0]!.status).toBe('open');
  });

  it('maps duplicate names and bulk-enters a holiday for every team once', async () => {
    await addDivision(SLUG, { seasonId, name: 'Open', legs: '2' });
    expect(await addDivision(SLUG, { seasonId, name: 'Open', legs: '1' })).toEqual({ error: 'A division with that name already exists in this season.' });
    const divisionId = (await db.division.findFirstOrThrow()).id;
    for (const name of ['Tigers', 'Cubs']) await addTeam(SLUG, { divisionId, name, contactEmail: '' });
    expect(await addTeam(SLUG, { divisionId, name: 'Cubs', contactEmail: '' })).toEqual({ error: 'A team with that name already exists in this season.' });
    const tiger = (await db.team.findFirstOrThrow({ where: { name: 'Tigers' } })).id;
    await addBlackout(SLUG, { teamId: tiger, day: '2026-10-12', reason: '' });
    expect(await addBlackout(SLUG, { teamId: tiger, day: '2026-10-12', reason: '' })).toEqual({ error: 'That team already has a blackout on that day.' });
    expect(await addHoliday(SLUG, { seasonId, day: '2026-10-12', reason: 'Holiday' })).toEqual({ notice: 'Blackout added for 1 of 2 teams.' });
    expect(await db.blackout.count()).toBe(2);
  });

  it('saves rules and refuses an out-of-range value', async () => {
    const ok = { seasonId, maxGamesPerTeamPerDay: 2, minRestDays: 1, maxGapDays: 10, minRematchDays: 7, rest: 5, longGap: 4, slotEquity: 3, fieldEquity: 2, rematch: 1 };
    await saveRules(SLUG, ok);
    expect((await db.season.findUniqueOrThrow({ where: { id: seasonId } })).rules).toEqual({ maxGamesPerTeamPerDay: 2, minRestDays: 1, maxGapDays: 10, minRematchDays: 7, weights: { rest: 5, longGap: 4, slotEquity: 3, fieldEquity: 2, rematch: 1 } });
    expect(await saveRules(SLUG, { ...ok, maxGamesPerTeamPerDay: 0 })).toEqual({ error: 'Max games per day must be at least 1.' });
  });
});
