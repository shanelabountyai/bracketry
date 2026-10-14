import { beforeEach, describe, expect, it } from 'vitest';
import { AuthzError } from '@/core/authz/guards';
import { advanceClock } from '@/core/clock';
import { db } from '@/core/db';
import * as setup from '@/app/o/[org]/seasons/actions';
import * as brackets from '@/app/o/[org]/seasons/bracket-actions';
import * as generating from '@/app/o/[org]/seasons/generate-actions';
import * as rainout from '@/app/o/[org]/seasons/rainout-actions';
import * as results from '@/app/o/[org]/seasons/result-actions';
import * as standings from '@/app/o/[org]/seasons/standings-actions';
import * as versions from '@/app/o/[org]/seasons/version-actions';
import * as withdrawing from '@/app/o/[org]/seasons/withdraw-actions';
import { resetAuthTables, signInAs } from '../helpers/auth';
import { addMember, makeOrg } from '../helpers/org';

// L-040 (D-30's restore, template v1.3.0): a scorekeeper enters and corrects scores and nothing else, and needs no MFA.
const SLUG = 'league';
const RESULTS = ['recordResult', 'voidResult', 'recordBracketResult', 'clearBracketResult'];
type Action = ((slug: string, input: unknown) => Promise<unknown>) & { spec: { kind: 'org'; perm: string | null } };
const orgActions = (Object.entries({ ...setup, ...brackets, ...generating, ...rainout, ...results, ...standings, ...versions, ...withdrawing }) as [string, unknown][])
  .filter((e): e is [string, Action] => (e[1] as { spec?: { kind?: string } }).spec?.kind === 'org')
  .sort(([a], [b]) => a.localeCompare(b));

let orgId: string;
let seasonId: string;
let owner: string;

beforeEach(async () => {
  advanceClock(0);
  await resetAuthTables();
  orgId = (await makeOrg(SLUG)).id;
  owner = (await addMember(orgId, 'owner', 'o@example.test')).id;
  const s = await db.season.create({ data: { orgId, name: 'Fall', timezone: 'America/Chicago', firstDay: '2026-10-05', lastDay: '2026-12-31', gameMinutes: 60, rules: {}, standingsConfig: {} } });
  seasonId = s.id;
  const d = await db.division.create({ data: { orgId, seasonId, name: 'Open', legs: 1 } });
  for (let i = 0; i < 4; i++) await db.team.create({ data: { orgId, seasonId, divisionId: d.id, name: `T${i}` } });
  const f = await db.field.create({ data: { orgId, name: 'F1' } });
  const days = ['2026-10-06', '2026-10-13', '2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10'];
  await db.fieldSlot.createMany({ data: days.flatMap((day) => ['18:00', '19:30'].map((start) => ({ orgId, seasonId, fieldId: f.id, day, start }))) });
  await signInAs(owner, { mfa: true });
  await generating.generate(SLUG, { seasonId, seed: '1', maxIterations: '300' });
  await versions.publish(SLUG, { versionId: (await db.scheduleVersion.findFirstOrThrow()).id, reason: 'Go' });
  advanceClock(new Date('2026-10-07T12:00:00Z').getTime() - Date.now());
});

const as = async (role: 'scorekeeper' | 'member', email: string) => {
  const u = await db.user.create({ data: { email } }); // never TOTP-enrolled
  await db.membership.create({ data: { orgId, userId: u.id, role } });
  await signInAs(u.id);
};
const firstGame = async () => (await db.placement.findFirstOrThrow({ where: { fieldSlot: { day: '2026-10-06' } }, select: { gameId: true } })).gameId;

describe('L-040 scorekeeper', () => {
  it('the four result actions, and only they, take results.write', () => {
    expect(orgActions.filter(([, a]) => a.spec.perm === 'results.write').map(([n]) => n).sort()).toEqual([...RESULTS].sort());
  });

  it('a scorekeeper with no MFA enters, corrects and voids a season score', async () => {
    await as('scorekeeper', 'sk@example.test');
    const gameId = await firstGame();
    expect(await results.recordResult(SLUG, { gameId, homeRuns: '3', awayRuns: '2' })).toEqual({ notice: 'Score saved.' });
    expect(await results.recordResult(SLUG, { gameId, homeRuns: '4', awayRuns: '2', correction: 'on', reason: 'Typo' })).toMatchObject({ notice: expect.any(String) });
    expect(await results.voidResult(SLUG, { gameId, reason: 'Wrong game' })).toMatchObject({ notice: expect.any(String) });
    expect((await db.gameResult.findMany({ where: { gameId } })).map((r) => (r.voided ? 'void' : r.homeRuns)).sort()).toEqual([3, 4, 'void']); // same instant on a frozen clock, so not by time
  });

  it('a scorekeeper reaches the playoff score actions (past the guard to the missing game)', async () => {
    await as('scorekeeper', 'sk@example.test');
    for (const a of [brackets.recordBracketResult, brackets.clearBracketResult]) {
      await expect(a(SLUG, { gameId: crypto.randomUUID(), aRuns: '1', bRuns: '0' })).rejects.toThrow('notFound'); // the test setup's notFound, thrown after the guard
    }
  });

  it('a scorekeeper is refused every other league action, and nothing is written', async () => {
    await as('scorekeeper', 'sk@example.test');
    const before = await db.scheduleVersion.count();
    const others = orgActions.filter(([n]) => !RESULTS.includes(n));
    expect(others.length).toBeGreaterThan(20);
    for (const [name, a] of others) await expect(a(SLUG, {}), name).rejects.toBeInstanceOf(AuthzError);
    expect(await db.scheduleVersion.count()).toBe(before);
  });

  it('a member is refused every result action (D-30)', async () => {
    await as('member', 'm@example.test');
    for (const n of RESULTS) await expect(orgActions.find(([name]) => name === n)![1](SLUG, {}), n).rejects.toBeInstanceOf(AuthzError);
  });
});
