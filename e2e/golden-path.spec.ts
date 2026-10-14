import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { addDays, shortDay, weekday } from '@/lib/league/days';
import type { seedBracketry } from '../scripts/seed-bracketry';

// L-021, golden path 2: a commissioner takes the seeded Eastside season from a published schedule through a
// three-way tie, a bracket and a champion, then rains out a day and sees only the rained-out games move (D-12).
// Against the production build, as the commissioner, through the same forms a person would use.
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
test.afterAll(() => db.end());

let league: Awaited<ReturnType<typeof seedBracketry>>;
test.beforeEach(() => {
  // The same command the demo uses, against the database test:e2e points at. It replaces the league, so each test starts from the seed.
  league = JSON.parse(execFileSync('npx', ['tsx', 'scripts/seed-bracketry.ts', '--json'], { encoding: 'utf8' }));
});

/** A playoff game is scored on or after its day and is only ever placed after today, so the test moves its slot into the past. */
const playoffDayArrives = () =>
  db.query(
    `UPDATE "FieldSlot" SET day = to_char(to_date(day, 'YYYY-MM-DD') - 70, 'YYYY-MM-DD')
     WHERE day > $1 AND id IN (SELECT "fieldSlotId" FROM "BracketGame" g JOIN "Org" o ON o.id = g."orgId" WHERE o.slug = $2)`,
    [league.today, league.slug],
  );

async function addMakeupSlot(page: Page, field: string, day: string, start: string) {
  const form = page.locator('form', { has: page.getByRole('button', { name: 'Add makeup slot' }) });
  await form.getByLabel('Makeup field').selectOption({ label: field });
  await form.getByLabel('Makeup day').fill(day);
  await form.getByLabel('Start').fill(start);
  await form.getByRole('button', { name: 'Add makeup slot' }).click();
  await expect(page.getByText(`${day} ${start} · ${field} · makeup`)).toBeVisible();
}

test('standings through a three-way tie, a bracket and a champion, then a rainout that moves only the rained-out games', async ({ page }) => {
  test.setTimeout(120_000);
  const base = `/o/${league.slug}/seasons/${league.seasonId}`;
  await page.goto('/demo');
  await page.getByRole('button', { name: league.email }).click();
  await expect(page.getByRole('heading', { name: 'Your orgs' })).toBeVisible();

  // The seeded season: one published version with nothing illegal and nothing unplaced, and its quality table.
  await page.goto(base);
  await expect(page.getByRole('row').filter({ hasText: 'Opening day schedule' })).toContainText('published');
  await expect(page.getByRole('row').filter({ hasText: 'Opening day schedule' })).toContainText('0 hard, 0 unplaced');
  // L-029 (GEN-08): games have scores, so the plain Generate forms are gone and a sentence points to "Regenerate the rest".
  await expect(page.getByRole('button', { name: 'Generate draft' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New seed' })).toHaveCount(0);
  await expect(page.getByText('A game in this season has a score, so a plain run is closed')).toBeVisible();
  // L-028 (SCORE-10..12): the Results section opens with the unscored count, and a game after today has no score form.
  await expect(page.getByText(/^(Every game played so far has a score\.|\d+ played games? (has|have) no score yet\.)$/)).toBeVisible();
  const lastDayGames = page.getByRole('listitem').filter({ hasText: new RegExp(` v .* · ${league.lastDay} \\d\\d:\\d\\d · .* · no score`) });
  await expect(lastDayGames.first()).toBeVisible();
  await expect(lastDayGames.filter({ has: page.getByRole('button', { name: 'Save score' }) })).toHaveCount(0);
  await page.getByRole('link', { name: 'Quality' }).click();
  await expect(page.getByRole('heading', { name: 'Score' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Aces/ })).toContainText('8'); // nine teams, everyone plays everyone once

  // The three tied teams hold three consecutive ranks, in the order the chain gave them. No commissioner decision is asked for.
  await page.goto(`${base}/standings`);
  const rank = async (team: string) => Number(await page.getByRole('row').filter({ has: page.getByRole('cell', { name: team, exact: true }) }).getByRole('cell').first().innerText()); // by the Team cell: a row's note names other teams
  const first = await rank(league.trio[0]!);
  expect([await rank(league.trio[1]!), await rank(league.trio[2]!)]).toEqual([first + 1, first + 2]);
  await expect(page.getByText('needs commissioner decision')).toHaveCount(0);
  // L-037: the points and run settings are on the page with the season's stored values. Nothing is saved here.
  await expect(page.getByLabel('Points for a win')).toHaveValue('2');
  await expect(page.getByLabel('Most runs one game can add')).toHaveValue('7');

  // What-if (L-023): the cut line is a query parameter, and nothing typed there is stored.
  await page.getByLabel('Teams that qualify').fill('2');
  await page.getByRole('button', { name: 'Show what-if table' }).click();
  await expect(page.getByRole('columnheader', { name: 'Top 2' }).first()).toBeVisible();

  // Playoff weekend: two slots on the Saturday after the season and one on the Sunday.
  const saturday = addDays(league.lastDay, 2);
  await page.goto(base);
  await addMakeupSlot(page, 'North Diamond', saturday, '10:00');
  await addMakeupSlot(page, 'South Diamond', saturday, '10:00');
  await addMakeupSlot(page, 'North Diamond', addDays(saturday, 1), '10:00');

  // Top four of A Division: seed, place, play the semifinals, place and play the final.
  await page.goto(`${base}/bracket`);
  const a = page.locator('section', { has: page.getByRole('heading', { name: 'A Division' }) });
  const toScore = a.locator('form', { has: page.getByRole('button', { name: 'Save score' }) });
  const play = async (games: number) => {
    await a.getByRole('button', { name: 'Place games into slots' }).click();
    await expect(a.getByRole('status').filter({ hasText: 'Placed' })).toContainText(`Placed ${games} of ${games} games.`);
    await expect(a.getByRole('status').filter({ hasText: 'Placed' })).toContainText(/\d+ team notices queued/); // L-034 (BRKT-07)
    await playoffDayArrives();
    await page.reload();
    for (let left = games; left > 0; left--) {
      await expect(toScore).toHaveCount(left);
      await toScore.first().getByRole('spinbutton').nth(0).fill('5');
      await toScore.first().getByRole('spinbutton').nth(1).fill('2');
      await toScore.first().getByRole('button', { name: 'Save score' }).click();
    }
    await expect(toScore).toHaveCount(0);
  };
  await a.getByRole('button', { name: 'Generate bracket' }).click();
  await expect(a.getByText('no slot yet')).toHaveCount(2);
  await play(2);
  await play(1);
  await expect(a.getByText(/^Champion: \w+$/)).toBeVisible();
  const champion = (await a.getByText(/^Champion: \w+$/).innerText()).slice('Champion: '.length);

  // The public page (L-032): the playoff line under fourth place, round names, the champion. The champion's feed has the final (L-034, ICAL-02).
  const publicPage = `/l/${league.slug}/${league.seasonId}`;
  await page.goto(publicPage);
  const aPublic = page.locator('#playoffs div', { has: page.getByRole('heading', { name: 'A Division' }) });
  await expect(page.locator('#standings').getByText('Playoff line: top 4').first()).toBeVisible();
  await expect(aPublic.getByRole('listitem').filter({ hasText: /^Semifinal 1: \(1\) / })).toContainText('won');
  await expect(aPublic.getByRole('listitem').filter({ hasText: /^Semifinal 2: / })).toContainText('won');
  await expect(aPublic.getByRole('listitem').filter({ hasText: /^Final: / })).toContainText(`${champion} won`);
  await expect(aPublic.getByText(`Champion: ${champion}`)).toBeVisible();
  const ics = await (await page.request.get(`${publicPage}/calendar.ics?team=${encodeURIComponent(champion)}`)).text();
  expect(ics).toContain('DESCRIPTION:A Division · Final\r\n');
  expect(ics).toContain('DESCRIPTION:A Division · Semifinal ');

  // Rain on the next game day. Four makeup slots on the Saturday after it, so every displaced game has somewhere to go.
  await page.goto(base);
  const makeup = addDays(league.rainDay, 6 - weekday(league.rainDay));
  for (const field of ['North Diamond', 'South Diamond']) for (const start of ['10:00', '11:30']) await addMakeupSlot(page, field, makeup, start);
  await page.getByLabel('Close every slot on').fill(league.rainDay);
  await page.getByRole('button', { name: 'Close day' }).click();
  const heading = page.getByRole('heading', { name: /Displaced games \([1-4]\)/ });
  await expect(heading).toBeVisible();
  const n = Number((await heading.innerText()).match(/\d+/)![0]);

  await page.getByRole('button', { name: 'Propose reschedule' }).click();
  await expect(page.getByText(`${n} of ${n} displaced games moved, 0 have no legal slot. Every other game kept its slot.`)).toBeVisible();
  // D-12 as the commissioner sees it: comparing the two versions lists exactly the displaced games.
  await page.goto(`${base}?a=1&b=2`);
  await expect(page.getByRole('heading', { name: `Version 1 to version 2: ${n} games changed slot` })).toBeVisible();

  const draft = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Publish' }) });
  await draft.getByLabel('Reason').fill(`Rain on ${league.rainDay}`);
  await draft.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('row').filter({ hasText: `Rain on ${league.rainDay}` })).toContainText('published');
  await expect(page.getByRole('row').filter({ hasText: 'Opening day schedule' })).toContainText('superseded');
  await expect(page.getByRole('heading', { name: 'Displaced games (0)' })).toBeVisible();

  // L-032 (PUB-02, PUB-06): the public page lists exactly the moved games, each with its new slot and its old one.
  await page.goto(publicPage);
  const changes = page.getByRole('region', { name: 'Changes this week' }).getByRole('listitem');
  await expect(changes).toHaveCount(n);
  for (const moved of await changes.allInnerTexts()) expect(moved).toMatch(new RegExp(`: now ${shortDay(makeup)} \\d\\d:\\d\\d · \\w+ Diamond, was ${shortDay(league.rainDay)} \\d\\d:\\d\\d · \\w+ Diamond$`));
});

// The forms no other spec submits: edit a team (L-030), a preview link made and revoked (L-039), a void and the
// confirm line (L-031), a withdrawal (L-036), points (L-037), copy a season (L-038) and crossover rounds (L-026). What is asserted is what the page shows afterwards.
test('edit a team, preview and revoke a draft, void and re-enter a score, withdraw a team, change the points, copy the season', async ({ page }) => {
  test.setTimeout(120_000);
  const base = `/o/${league.slug}/seasons/${league.seasonId}`;
  await page.goto('/demo');
  await page.getByRole('button', { name: league.email }).click();
  await expect(page.getByRole('heading', { name: 'Your orgs' })).toBeVisible();
  await page.goto(base);

  // Edit a team: a new name, and the contact email taken away, which the list flags at once (SEASON-08).
  const owls = page.locator('section', { has: page.getByRole('heading', { name: /^B Division/ }) }).getByRole('listitem').filter({ hasText: 'Owls' });
  await owls.getByText('Edit', { exact: true }).click();
  await owls.getByLabel('Team').fill('Owls United');
  await owls.getByLabel('Contact email (internal)').fill('');
  await owls.getByRole('button', { name: 'Save team' }).click();
  await expect(owls).toContainText('Owls United · no contact email');

  // A draft to preview: the only kind this season can still make, since games have scores.
  await page.getByLabel(/I understand up to \d+ games may move/).check();
  await page.getByRole('button', { name: 'Regenerate the rest' }).click();
  await expect(page.getByText(/Draft version 2 keeps the \d+ played games/)).toBeVisible({ timeout: 30_000 }); // the generator has timed 6.1 s locally (L-025)
  const draft = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Create preview link' }) });
  await draft.getByRole('button', { name: 'Create preview link' }).click();
  await expect(draft.getByRole('status')).toContainText('/preview/');
  const preview = new URL(await draft.getByRole('status').innerText()).pathname;
  const shown = await page.request.get(preview);
  expect(shown.status()).toBe(200);
  expect(await shown.text()).toContain('This schedule has not been published');
  const links = page.getByRole('list', { name: 'Preview links' });
  await expect(links).toContainText('Version 2: expires');
  await links.getByRole('button', { name: 'Revoke' }).click();
  await expect(links).toHaveCount(0);
  expect((await page.request.get(preview)).status()).toBe(404);

  // Void a score (D-45): the game has no score again and the history keeps the voided one.
  const gameId = await page.locator('form', { has: page.getByRole('button', { name: 'Void this score' }) }).first().locator('input[name="gameId"]').inputValue();
  const game = page.locator('li', { has: page.locator(`input[name="gameId"][value="${gameId}"]`) });
  await game.getByLabel('Entered on the wrong game? Reason').fill('Entered on the wrong game');
  await game.getByRole('button', { name: 'Void this score' }).click();
  await expect(game.getByRole('button', { name: 'Void this score' })).toHaveCount(0);
  await expect(game).toContainText('· no score');
  await expect(game).toContainText('Voided');

  // D-52 (2): the voided game is now a game before today with no score, so its home team is refused, and nothing changes.
  // The voided game, not tonight's: the seed only has games on Tuesdays and Thursdays, so tonight may have none.
  const owing = (await game.innerText()).split(' v ')[0]!.trim();
  const busy = page.locator('section', { has: page.getByRole('heading', { name: / Division \(/ }) }).getByRole('listitem').filter({ hasText: owing });
  await busy.getByText('Withdraw', { exact: true }).click();
  await busy.getByLabel('Reason').fill('Not enough players');
  await busy.getByLabel(`Withdraw ${owing} and forfeit its unplayed games`).check();
  await busy.getByRole('button', { name: 'Withdraw team' }).click();
  await expect(busy.getByRole('alert')).toContainText(`${owing} has games on or before today with no score`);
  await expect(busy).not.toContainText(/withdrew \d{4}-\d\d-\d\d/);

  // The confirm line (SCORE-13): without the tick the browser sends nothing; with it the score is saved.
  await game.getByRole('spinbutton').nth(0).fill('9');
  await game.getByRole('spinbutton').nth(1).fill('1');
  await game.getByRole('button', { name: 'Save score' }).click();
  expect(await game.getByRole('checkbox').evaluate((box: HTMLInputElement) => box.validity.valueMissing)).toBe(true);
  await expect(game).toContainText('· no score');
  await game.getByRole('checkbox').check();
  await game.getByRole('button', { name: 'Save score' }).click();
  await expect(game).toContainText('9–1');

  // A team withdraws (WD-01 to WD-03). One that plays tonight would be refused until tonight has scores, so take one that does not.
  const tonight = (await page.locator('li', { has: page.getByRole('button', { name: 'Save score' }) }).allInnerTexts()).join(' ');
  const leaving = ['Jets', 'Kings', 'Lions', 'Mustangs', 'Nomads', 'Aces', 'Bandits', 'Dukes', 'Eagles'].find((t) => !tonight.includes(t))!;
  const team = page.locator('section', { has: page.getByRole('heading', { name: / Division \(/ }) }).getByRole('listitem').filter({ hasText: leaving });
  await team.getByText('Withdraw', { exact: true }).click();
  await team.getByLabel('Reason').fill('Not enough players');
  await team.getByLabel(`Withdraw ${leaving} and forfeit its unplayed games`).check();
  await team.getByRole('button', { name: 'Withdraw team' }).click();
  await expect(team).toContainText(/withdrew \d{4}-\d\d-\d\d/);
  await expect(page.getByText(new RegExp(`Version 1 without the \\d+ unplayed games of ${leaving}, which withdrew\\. No game was placed or moved\\.`))).toBeVisible();

  // Points (STAND-02): scores exist, so a reason is asked for, and the table is worked out again from them.
  await page.goto(`${base}/standings`);
  const scoring = page.locator('form', { has: page.getByRole('button', { name: 'Save points and runs' }) });
  await scoring.getByLabel('Points for a win').fill('3');
  await scoring.getByLabel('Reason').fill('Board vote');
  await scoring.getByRole('button', { name: 'Save points and runs' }).click();
  await expect(scoring.getByRole('status')).toContainText('Points and run settings saved.');
  await page.reload();
  await expect(page.getByLabel('Points for a win')).toHaveValue('3');
  const [tie, loss] = [Number(await page.getByLabel('Points for a tie').inputValue()), Number(await page.getByLabel('Points for a loss').inputValue())];
  const top = (await page.getByRole('row').nth(1).getByRole('cell').allInnerTexts()).map(Number); // Rank, Team, P, W, L, T, Pts
  expect(top[6]).toBe(3 * top[3]! + loss * top[4]! + tie * top[5]!);

  // Copy the season (D-49): divisions, teams as they are now, and weekly slots come along; nothing dated does.
  await page.goto(`/o/${league.slug}/seasons`);
  const copy = page.locator('form', { has: page.getByRole('button', { name: 'Copy season' }) });
  await copy.getByLabel('Name').fill('Softball next');
  await copy.getByLabel('First day').fill('2027-04-06');
  await copy.getByLabel('Last day').fill('2027-05-27');
  await copy.getByRole('button', { name: 'Copy season' }).click();
  await expect(page.getByRole('heading', { name: 'Softball next' })).toBeVisible();
  await expect(page.getByText('2027-04-06 to 2027-05-27')).toBeVisible();
  await expect(owls).toContainText('Owls United · no contact email');
  await expect(page.getByText('Tuesday 18:00 · North Diamond')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Slots \([1-9]\d*\)$/ })).toBeVisible();
  await expect(page.getByText(/\d{4}-\d\d-\d\d · Comets/)).toHaveCount(0); // the source's blackout
  await expect(page.getByText('Scores are entered against the published version. Publish one first.')).toBeVisible();

  // Crossover rounds (DBL-01), on the copy, where nothing is scheduled yet: six B Division teams, so six games a round.
  await page.getByLabel('Crossover rounds').fill('1');
  await page.getByRole('button', { name: 'Save crossover rounds' }).click();
  await expect(page.getByText('This season has 6 crossover games.')).toBeVisible();
});

// L-040: the seeded scorekeeper (no MFA) sees the score forms and none of the commissioner's, and a correction saves.
test('a scorekeeper corrects a score and sees nothing else that edits', async ({ page }) => {
  const base = `/o/${league.slug}/seasons/${league.seasonId}`;
  await page.goto('/demo');
  await page.getByRole('button', { name: league.scorekeeper }).click();
  await expect(page.getByRole('heading', { name: 'Your orgs' })).toBeVisible();
  await page.goto(base);
  for (const name of ['Close day', 'Publish', 'Withdraw team', 'Save team', 'Add makeup slot', 'Propose reschedule', 'Regenerate the rest', 'Pin game'])
    await expect(page.getByRole('button', { name, exact: true }), name).toHaveCount(0);
  // A correction, not a first score: the seed scores every game before today, and today may have no games (Tue/Thu only).
  const gameId = await page.locator('form', { has: page.getByRole('button', { name: 'Save correction' }) }).first().locator('input[name="gameId"]').inputValue();
  const scored = page.locator('li', { has: page.locator(`input[name="gameId"][value="${gameId}"]`) });
  await scored.getByRole('spinbutton').nth(0).fill('16');
  await scored.getByRole('spinbutton').nth(1).fill('13');
  await scored.getByLabel('Reason for the correction').fill('Scorebook recount');
  await scored.getByRole('checkbox', { name: /^This is / }).check();
  await scored.getByRole('button', { name: 'Save correction' }).click();
  await expect(scored).toContainText('16–13');
  await expect(scored).toContainText('Scorebook recount');
  await page.goto(`${base}/bracket`);
  await expect(page.getByRole('button', { name: 'Generate bracket' })).toHaveCount(0);
  await page.goto(`${base}/standings`);
  await expect(page.getByRole('button', { name: 'Save points and runs' })).toHaveCount(0);
});
