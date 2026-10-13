import { beforeEach, describe, expect, it } from 'vitest';
import { advanceClock } from '@/core/clock';
import { db } from '@/core/db';
import { addDays } from '@/lib/league/days';
import { requireOrg } from '@/core/authz/guards';
import { clearBracketResult, generateBracket, placeBracketGames, recordBracketResult } from '@/app/o/[org]/seasons/bracket-actions';
import { loadBrackets } from '@/app/o/[org]/seasons/bracket-load';
import { generate } from '@/app/o/[org]/seasons/generate-actions';
import { loadSeasonInput } from '@/app/o/[org]/seasons/load-input';
import { closeDay } from '@/app/o/[org]/seasons/rainout-actions';
import { publish } from '@/app/o/[org]/seasons/version-actions';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-018: playoffs. Four teams, six games on Tuesdays from 2026-10-06 (America/Chicago), version 1 published.
// Every season game is scored so that the lower-numbered team wins: T0 3-0, T1 2-1, T2 1-2, T3 0-3.
// Top 4 is therefore R1M1 T0 v T3, R1M2 T1 v T2. Playoff slots are Tuesdays 2026-11-17 and 2026-11-24.
const SLUG = 'league';
let orgId: string;
let seasonId: string;
let divisionId: string;
let fieldId: string;
let team: Record<string, string>; // name → id
let ownerId: string;

// The session does not outlive a jump of weeks, so the owner signs in again after each one.
const setNow = async (iso: string) => {
  advanceClock(new Date(iso).getTime() - Date.now());
  await signInAs(ownerId, { mfa: true });
};
const slot = (day: string, start: string) => db.fieldSlot.create({ data: { orgId, seasonId, fieldId, day, start } });
const seed = (n: number) => generateBracket(SLUG, { seasonId, divisionId, n: String(n) });
const bracket = async () => (await loadBrackets(await requireOrg(SLUG), seasonId))!.byDivision[0]!.bracket!;
const games = async () => Object.fromEntries((await db.bracketGame.findMany({ include: { fieldSlot: true } })).map((g) => [g.matchId, g]));
const place = async () => placeBracketGames(SLUG, { bracketId: (await db.bracket.findFirstOrThrow()).id });
const score = async (matchId: string, aRuns: number, bRuns: number, forfeit = '', reason = '') => recordBracketResult(SLUG, { gameId: (await games())[matchId]!.id, aRuns: String(aRuns), bRuns: String(bRuns), forfeit, reason });
const clear = async (matchId: string) => clearBracketResult(SLUG, { gameId: (await games())[matchId]!.id });

beforeEach(async () => {
  advanceClock(0);
  await resetAuthTables();
  const org = await makeOrg(SLUG);
  orgId = org.id;
  ownerId = (await addMember(org.id, 'owner', 'o@example.test')).id;
  await signInAs(ownerId, { mfa: true });
  seasonId = (await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } })).id;
  divisionId = (await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } })).id;
  team = {};
  for (let i = 0; i < 4; i++) team[`T${i}`] = (await db.team.create({ data: { orgId, seasonId, divisionId, name: `T${i}` } })).id;
  fieldId = (await db.field.create({ data: { orgId, name: 'F1' } })).id;
  const days = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
  await db.fieldSlot.createMany({ data: days.flatMap((day) => ['18:00', '19:30'].map((start) => ({ orgId, seasonId, fieldId, day, start }))) });
  await generate(SLUG, { seasonId, seed: '1', maxIterations: '300' });
  await publish(SLUG, { versionId: (await db.scheduleVersion.findFirstOrThrow()).id, reason: 'Go' });
  const name = Object.fromEntries(Object.entries(team).map(([n, id]) => [id, n]));
  for (const g of await db.game.findMany()) {
    const homeWins = name[g.homeTeamId]! < name[g.awayTeamId]!;
    await db.gameResult.create({ data: { orgId, gameId: g.id, homeRuns: homeWins ? 5 : 1, awayRuns: homeWins ? 1 : 5, enteredBy: crypto.randomUUID() } });
  }
  await setNow('2026-11-11T18:00:00Z');
});

describe('generateBracket', () => {
  it('seeds the top N, freezes them, warns on a later correction and regenerates only before the first result', async () => {
    expect(await seed(5)).toEqual({ error: expect.stringContaining('only 4 teams') });
    expect(await seed(4)).toEqual({ notice: expect.stringContaining('generated for the top 4') });
    let b = await bracket();
    expect(b.seeds).toEqual([team.T0, team.T1, team.T2, team.T3]);
    expect([b.stale, b.reseeds, b.started]).toEqual([false, false, false]);
    const g = await games();
    expect([g.R1M1!.aTeamId, g.R1M1!.bTeamId, g.R1M2!.aTeamId, g.R1M2!.bTeamId]).toEqual([team.T0, team.T3, team.T1, team.T2]);
    expect([g.R2M1!.aTeamId, g.R2M1!.bTeamId]).toEqual([null, null]);

    // A correction: T3 beat T0 after all. T0 and T1 are now 2-1 (T0 won their game), T2 and T3 1-2 (T2 won theirs):
    // every row's numbers moved, the order did not.
    const t0t3 = await db.gameResult.findFirstOrThrow({ where: { game: { OR: [{ homeTeamId: team.T0, awayTeamId: team.T3 }, { homeTeamId: team.T3, awayTeamId: team.T0 }] } }, include: { game: true } });
    const t3Home = t0t3.game.homeTeamId === team.T3;
    await db.gameResult.create({ data: { orgId, gameId: t0t3.gameId, homeRuns: t3Home ? 5 : 1, awayRuns: t3Home ? 1 : 5, supersedesId: t0t3.id, reason: 'Misread', enteredBy: crypto.randomUUID() } });
    b = await bracket();
    expect([b.stale, b.reseeds]).toEqual([true, false]);
    expect(b.seeds).toEqual([team.T0, team.T1, team.T2, team.T3]); // warned, not reseeded (D-15)

    // Regenerating reads the standings as they are now.
    expect(await seed(2)).toEqual({ notice: expect.stringContaining('regenerated for the top 2') });
    b = await bracket();
    expect([b.seeds, b.stale]).toEqual([[team.T0, team.T1], false]);
    expect(await db.bracketGame.count()).toBe(1);

    await slot('2026-11-17', '18:00');
    await place();
    await setNow('2026-11-18T18:00:00Z');
    expect(await score('R1M1', 4, 2)).toEqual({ notice: expect.stringContaining('Score saved') });
    expect(await seed(2)).toEqual({ error: expect.stringContaining('can no longer be regenerated') });
  });

  it('is blocked while a team inside the cut is in an undecided tie', async () => {
    // Three teams in a cycle on top of a fresh division: A 1-0 B, B 1-0 C, C 1-0 A.
    const d = (await db.division.create({ data: { orgId, seasonId, name: 'Cycle', legs: 1 } })).id;
    const [A, B, C] = await Promise.all(['A', 'B', 'C'].map(async (name) => (await db.team.create({ data: { orgId, seasonId, divisionId: d, name } })).id));
    for (const [home, away] of [[A, B], [B, C], [C, A]] as const) {
      const g = await db.game.create({ data: { orgId, seasonId, divisionId: d, key: `${home}~${away}`, round: 1, leg: 1, homeTeamId: home!, awayTeamId: away! } });
      await db.gameResult.create({ data: { orgId, gameId: g.id, homeRuns: 1, awayRuns: 0, enteredBy: crypto.randomUUID() } });
    }
    expect(await generateBracket(SLUG, { seasonId, divisionId: d, n: '2' })).toEqual({ error: expect.stringContaining('needs a commissioner decision') });
    expect(await db.bracket.count()).toBe(0);
  });
});

describe('placing and playing', () => {
  it('places each round under the hard rules, feeds winners forward, and corrects only until the next game is played', async () => {
    await seed(4);
    // Free slots after today: two on Nov 17, one on Nov 24. T3 is blacked out on Nov 17.
    await slot('2026-11-17', '18:00');
    await slot('2026-11-17', '19:30');
    const nov24 = await slot('2026-11-24', '18:00');
    await db.blackout.create({ data: { orgId, teamId: team.T3!, day: '2026-11-17' } });
    expect(await score('R1M1', 5, 1)).toEqual({ error: expect.stringContaining('Place this game') });

    expect(await place()).toEqual({ notice: 'Placed 2 of 2 games. 0 team notices queued, 4 teams have no contact email.' });
    let g = await games();
    expect(g.R1M1!.fieldSlot!.day).toBe('2026-11-24'); // T0 v T3: the blackout rules out Nov 17
    expect(g.R1M2!.fieldSlot!.day).toBe('2026-11-17');
    expect(g.R2M1!.fieldSlotId).toBeNull(); // its teams are not known yet
    expect(await place()).toEqual({ error: expect.stringContaining('already has a slot') });
    // A slot that holds a playoff game is not offered to the season generator.
    const season = await loadSeasonInput(await requireOrg(SLUG), seasonId);
    expect([...season.slotRowIds.values()]).not.toContain(nov24.id);

    expect(await score('R1M2', 3, 2)).toEqual({ error: expect.stringContaining('on or before today') });
    await setNow('2026-11-25T18:00:00Z');
    expect(await score('R1M2', 3, 3)).toEqual({ error: expect.stringContaining('cannot end in a tie') });
    expect(await score('R1M2', 9, 9, 'a')).toEqual({ notice: expect.stringContaining('Score saved') }); // T1 forfeits: T2 advances
    expect(await score('R1M1', 5, 1)).toEqual({ notice: expect.stringContaining('Score saved') });
    g = await games();
    expect([g.R1M2!.aRuns, g.R1M2!.bRuns, g.R1M2!.forfeit, g.R1M2!.winnerTeamId]).toEqual([0, 0, 'a', team.T2]);
    expect([g.R2M1!.aTeamId, g.R2M1!.bTeamId]).toEqual([team.T0, team.T2]);

    // The final: no free slot after today until one is added. Only the final gets a slot (D-12).
    expect(await place()).toEqual({ notice: expect.stringContaining('Placed 0 of 1 games. R2M1: No free slot is left') });
    await slot('2026-12-01', '18:00');
    const before = [g.R1M1!.fieldSlotId, g.R1M2!.fieldSlotId];
    expect(await place()).toEqual({ notice: 'Placed 1 of 1 games. 0 team notices queued, 2 teams have no contact email.' });
    g = await games();
    expect([g.R1M1!.fieldSlotId, g.R1M2!.fieldSlotId]).toEqual(before);
    expect(g.R2M1!.fieldSlot!.day).toBe('2026-12-01');

    // A correction before the final is played changes who is in it.
    expect(await score('R1M1', 1, 5)).toEqual({ error: 'Give a reason for the correction.' }); // SCORE-09
    expect(await score('R1M1', 1, 5, '', 'Scorebook error')).toEqual({ notice: expect.stringContaining('Correction saved') });
    expect(await db.auditEvent.findFirstOrThrow({ where: { action: 'bracket.result_corrected' } })).toMatchObject({ data: expect.objectContaining({ reason: 'Scorebook error' }) });
    expect((await games()).R2M1!.aTeamId).toBe(team.T3);

    await setNow('2026-12-02T18:00:00Z');
    await score('R2M1', 2, 6);
    expect((await bracket()).bracket.rounds[1]![0]!.winner).toBe(team.T2);
    expect(await score('R1M1', 5, 1, '', 'x')).toEqual({ error: expect.stringContaining('Clear that result first') });
    expect(await clear('R1M1')).toEqual({ error: expect.stringContaining('Clear that result first') });
    expect(await clear('R2M1')).toEqual({ notice: 'Result cleared.' });
    expect(await score('R1M1', 5, 1, '', 'x')).toEqual({ notice: expect.stringContaining('Correction saved') });
    g = await games();
    expect([g.R2M1!.aTeamId, g.R2M1!.aRuns, g.R2M1!.winnerTeamId]).toEqual([team.T0, null, null]);
  });

  it('never puts a team on a day it has a season game, and re-places a game whose slot was closed', async () => {
    // Back to the day before the season's last game day, so those games are still ahead.
    const last = (await db.placement.findFirstOrThrow({ orderBy: { fieldSlot: { day: 'desc' } }, select: { fieldSlot: true } })).fieldSlot.day;
    await setNow(`${addDays(last, -1)}T18:00:00Z`);
    await seed(4);
    const ahead = await db.placement.findMany({ where: { fieldSlot: { day: last } }, select: { fieldSlot: { select: { day: true } }, game: { select: { homeTeamId: true, awayTeamId: true } } } });
    expect(ahead.length).toBeGreaterThan(0);
    for (const day of new Set(ahead.map((p) => p.fieldSlot.day))) await slot(day, '21:00'); // a free slot on each of those days
    await slot('2026-11-17', '18:00');
    await slot('2026-11-17', '19:30');
    await slot('2026-11-24', '18:00');
    await slot('2026-11-24', '19:30');

    expect(await place()).toEqual({ notice: 'Placed 2 of 2 games. 0 team notices queued, 4 teams have no contact email.' });
    let g = await games();
    for (const m of [g.R1M1!, g.R1M2!]) {
      const busy = ahead.filter((p) => p.fieldSlot.day === m.fieldSlot!.day).flatMap((p) => [p.game.homeTeamId, p.game.awayTeamId]);
      expect(busy).not.toContain(m.aTeamId);
      expect(busy).not.toContain(m.bTeamId);
    }

    const rained = g.R1M1!.fieldSlot!.day;
    await closeDay(SLUG, { seasonId, day: rained });
    const stays = g.R1M2!.fieldSlot!.day === rained ? null : g.R1M2!.fieldSlotId; // on another day, R1M2 must not move (D-12)
    expect(await place()).toEqual({ notice: expect.stringContaining(stays ? 'Placed 1 of 1 games.' : 'Placed 2 of 2 games.') });
    g = await games();
    for (const m of [g.R1M1!, g.R1M2!]) expect([m.fieldSlot!.status, m.fieldSlot!.day === rained]).toEqual(['open', false]);
    if (stays) expect(g.R1M2!.fieldSlotId).toBe(stays);
  });
});

describe('playoff games, the outbox and publish (L-034)', () => {
  it('queues a notice per team on placement, and refuses a draft that clashes with a placed playoff game', async () => {
    // T1 v T3 loses its score (a void), so a draft may move it. T0 and T1 are still the top two: the final is T0 v T1.
    const scored = await db.gameResult.findFirstOrThrow({ where: { game: { OR: [{ homeTeamId: team.T1, awayTeamId: team.T3 }, { homeTeamId: team.T3, awayTeamId: team.T1 }] } } });
    await db.gameResult.create({ data: { orgId, gameId: scored.gameId, homeRuns: 0, awayRuns: 0, voided: true, supersedesId: scored.id, reason: 'Wrong game', enteredBy: crypto.randomUUID() } });
    const v1 = await db.scheduleVersion.findFirstOrThrow({ include: { placements: true } });
    /** A draft that is the published version with T1 v T3 moved to `to`. */
    const draft = async (number: number, to: string) => {
      const v = await db.scheduleVersion.create({ data: { orgId, seasonId, number, seed: 1n, inputHash: 'x', fingerprint: 'y', report: v1.report as object, iterations: 0, accepted: 0, createdBy: ownerId } });
      await db.placement.createMany({ data: v1.placements.map((p) => ({ orgId, seasonId, scheduleVersionId: v.id, gameId: p.gameId, fieldSlotId: p.gameId === scored.gameId ? to : p.fieldSlotId })) });
      return v.id;
    };
    // The two drafts are made while the slots are free; the final is placed afterwards, on the only slot that exists yet.
    const sameSlot = await slot('2026-11-17', '18:00');
    const onSlot = await draft(2, sameSlot.id);
    await db.team.update({ where: { id: team.T0! }, data: { contactEmail: 'coach0@example.test' } });
    await seed(2);
    expect(await place()).toEqual({ notice: 'Placed 1 of 1 games. 1 team notices queued, 1 teams have no contact email.' }); // BRKT-07
    expect((await games()).R1M1!.fieldSlotId).toBe(sameSlot.id);
    const sent = await db.outbox.findMany();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: 'coach0@example.test', data: { subject: 'Fall: playoff game for T0', body: 'Open playoffs\n\nFinal, T0 v T1: was not scheduled, now 2026-11-17 18:00 at F1.' } });

    // BRKT-06: the same slot, then the same day for T1, then a clear day.
    const sameDay = await draft(3, (await slot('2026-11-17', '19:30')).id);
    const clear = await draft(4, (await slot('2026-11-24', '18:00')).id);
    for (const versionId of [onSlot, sameDay]) {
      expect(await publish(SLUG, { versionId, reason: 'Makeup' })).toEqual({ error: expect.stringContaining('clashes with the playoff games placed on 2026-11-17 18:00') });
    }
    expect(await db.scheduleVersion.count({ where: { status: 'draft' } })).toBe(3);
    expect(await publish(SLUG, { versionId: clear, reason: 'Makeup' })).toEqual({ notice: expect.stringContaining('Version 4 is published') });

    // A closed slot: the game is placed again and the notice names the slot it left.
    await closeDay(SLUG, { seasonId, day: '2026-11-17' });
    await slot('2026-12-01', '18:00');
    await place();
    expect((await db.outbox.findMany({ where: { to: 'coach0@example.test' } })).map((m) => (m.data as { body: string }).body)).toContain('Open playoffs\n\nFinal, T0 v T1: was 2026-11-17 18:00 at F1, now 2026-12-01 18:00 at F1.');
  });
});

