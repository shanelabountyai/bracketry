import { execFileSync } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import pg from 'pg';
import { addDays, weekday } from '@/lib/league/days';
import type { seedBracketry } from '../scripts/seed-bracketry';

// L-021, golden path 2: a commissioner takes the seeded Eastside season from a published schedule through a
// three-way tie, a bracket and a champion, then rains out a day and sees only the rained-out games move (D-12).
// Against the production build, as the commissioner, through the same forms a person would use.
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
test.afterAll(() => db.end());

let league: Awaited<ReturnType<typeof seedBracketry>>;
test.beforeAll(() => {
  // The same command the demo uses, against the database test:e2e points at.
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
  await page.getByRole('link', { name: 'Quality' }).click();
  await expect(page.getByRole('heading', { name: 'Score' })).toBeVisible();
  await expect(page.getByRole('row', { name: /Aces/ })).toContainText('8'); // nine teams, everyone plays everyone once

  // The three tied teams hold three consecutive ranks, in the order the chain gave them. No commissioner decision is asked for.
  await page.goto(`${base}/standings`);
  const rank = async (team: string) => Number(await page.getByRole('row').filter({ has: page.getByRole('cell', { name: team, exact: true }) }).getByRole('cell').first().innerText()); // by the Team cell: a row's note names other teams
  const first = await rank(league.trio[0]!);
  expect([await rank(league.trio[1]!), await rank(league.trio[2]!)]).toEqual([first + 1, first + 2]);
  await expect(page.getByText('needs commissioner decision')).toHaveCount(0);

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
});
