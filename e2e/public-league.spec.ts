import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import pg from 'pg';

// L-019 (PUB-01, PUB-03): the public league page, read with no session, against the production build.
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
test.afterAll(() => db.end());
test.beforeAll(() => db.query('DELETE FROM "RateLimit"')); // the server sees every local run as one IP

async function seedLeague(status: 'published' | 'draft') {
  const [org, season, division, home, away, field, slot, game, version, laterSlot, laterGame] = Array.from({ length: 11 }, () => randomUUID());
  const slug = `e2e-league-${org.slice(0, 8)}`;
  await db.query('INSERT INTO "Org" (id, slug, name, "updatedAt") VALUES ($1, $2, $2, now())', [org, slug]);
  await db.query(
    `INSERT INTO "Season" (id, "orgId", name, timezone, "firstDay", "lastDay", "gameMinutes", rules, "standingsConfig")
     VALUES ($1, $2, 'Spring Softball', 'America/Chicago', '2026-04-06', '2026-06-26', 60, '{}', '{}')`,
    [season, org],
  );
  await db.query('INSERT INTO "Division" (id, "orgId", "seasonId", name, legs) VALUES ($1, $2, $3, $4, 1)', [division, org, season, 'Open']);
  for (const [id, name] of [[home, 'Herons'], [away, 'Otters']]) {
    await db.query('INSERT INTO "Team" (id, "orgId", "seasonId", "divisionId", name, "contactEmail") VALUES ($1, $2, $3, $4, $5, $6)', [id, org, season, division, name, `coach-${name}@example.test`]);
  }
  await db.query('INSERT INTO "Field" (id, "orgId", name) VALUES ($1, $2, $3)', [field, org, 'North Diamond']);
  await db.query(`INSERT INTO "FieldSlot" (id, "orgId", "seasonId", day, start, "fieldId") VALUES ($1, $2, $3, '2026-04-07', '18:00', $4)`, [slot, org, season, field]);
  await db.query(
    `INSERT INTO "Game" (id, "orgId", "seasonId", "divisionId", key, round, leg, "homeTeamId", "awayTeamId") VALUES ($1, $2, $3, $4, $7, 1, 1, $5, $6)`,
    [game, org, season, division, home, away, `L1:${[home, away].sort().join('~')}`], // the engine's key for this pairing, so PUB-10 counts the game
  );
  await db.query(
    `INSERT INTO "ScheduleVersion" (id, "orgId", "seasonId", number, seed, "inputHash", fingerprint, status, report, iterations, accepted, "createdBy", "publishedAt")
     VALUES ($1, $2, $3, 1, 1, 'x', 'x', $4::"ScheduleStatus", '{}', 0, 0, $5, CASE WHEN $4 = 'published' THEN now() END)`,
    [version, org, season, status, randomUUID()],
  );
  await db.query('INSERT INTO "Placement" (id, "orgId", "seasonId", "scheduleVersionId", "gameId", "fieldSlotId") VALUES ($1, $2, $3, $4, $5, $6)', [randomUUID(), org, season, version, game, slot]);
  // L-032: a second game far in the future with no score, so a team has a next game
  await db.query(`INSERT INTO "FieldSlot" (id, "orgId", "seasonId", day, start, "fieldId") VALUES ($1, $2, $3, '2099-06-06', '19:00', $4)`, [laterSlot, org, season, field]);
  await db.query(
    `INSERT INTO "Game" (id, "orgId", "seasonId", "divisionId", key, round, leg, "homeTeamId", "awayTeamId") VALUES ($1, $2, $3, $4, 'L1:e2e2', 2, 1, $5, $6)`,
    [laterGame, org, season, division, away, home],
  );
  await db.query('INSERT INTO "Placement" (id, "orgId", "seasonId", "scheduleVersionId", "gameId", "fieldSlotId") VALUES ($1, $2, $3, $4, $5, $6)', [randomUUID(), org, season, version, laterGame, laterSlot]);
  await db.query('INSERT INTO "GameResult" (id, "orgId", "gameId", "homeRuns", "awayRuns", "enteredBy") VALUES ($1, $2, $3, 7, 4, $4)', [randomUUID(), org, game, randomUUID()]);
  return { slug, season };
}

test('anyone can read the published schedule, standings and score; no contact detail is on the page', async ({ page }) => {
  const { slug, season } = await seedLeague('published');
  const res = await page.goto(`/l/${slug}/${season}`);
  expect(res!.status()).toBe(200);
  expect(res!.headers()['content-security-policy']).toContain("frame-ancestors 'none'"); // INV-15 on a new public route
  await expect(page.getByRole('heading', { name: 'Spring Softball' })).toBeVisible();
  await expect(page.getByText('18:00 · North Diamond · Herons v Otters (Open) · 7-4')).toBeVisible();
  await expect(page.locator('#standings').getByRole('row', { name: /Herons/ })).toContainText('1'); // the standings table
  expect(await page.content()).not.toMatch(/coach-|example\.test/);

  await page.getByRole('link', { name: 'Otters' }).click();
  await expect(page.getByRole('heading', { name: 'Schedule: Otters' })).toBeVisible();
  await expect(page.getByText('Herons v Otters')).toBeVisible();

  // L-024 (ICAL-01): the team's feed, linked from its schedule
  const href = await page.getByRole('link', { name: 'Calendar feed for Otters (.ics)' }).getAttribute('href');
  const feed = await page.request.get(href!);
  expect(feed.headers()['content-type']).toBe('text/calendar; charset=utf-8');
  const ics = await feed.text();
  expect(ics).toContain('DTSTART;TZID=America/Chicago:20260407T180000\r\nDURATION:PT60M\r\nSUMMARY:Herons v Otters\r\nLOCATION:North Diamond');
  expect(ics).not.toMatch(/coach-|example\.test/);
});

test('on a phone: a team link opens on its next game, days read as words, nothing scrolls sideways (PUB-04..07)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { slug, season } = await seedLeague('published');
  await page.goto(`/l/${slug}/${season}?team=Otters`);
  await expect(page.getByText(/Next game: \w{3} Jun 6 · 19:00 · North Diamond · Otters v Herons/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tue Apr 7' })).toBeVisible();
  await expect(page.getByText(/Schedule updated \w{3} \w{3} \d+ \d\d:\d\d\./)).toBeVisible();
  await expect(page.locator('#standings').getByRole('rowheader', { name: /Herons/ })).toContainText('1st'); // the reason, under the name
  // L-035 (PUB-10): one game, 18:00 on North Diamond; the 19:00 slot holds a game the engine does not know
  await expect(page.getByRole('columnheader', { name: 'North Diamond' })).toBeVisible();
  await expect(page.locator('#fairness').getByRole('row', { name: 'Otters 1 1 0 1' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('a season with only a draft, an unknown season and a malformed id are all the same 404', async ({ request }) => {
  const { slug, season } = await seedLeague('draft');
  for (const path of [`/l/${slug}/${season}`, `/l/${slug}/${season}/calendar.ics?team=Herons`, `/l/${slug}/${randomUUID()}`, `/l/${slug}/not-a-uuid`, `/l/nobody/${season}`]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});
