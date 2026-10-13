## L-032: the public page on a phone (2026-10-13)

**Built.** Written first as PUB-04 to PUB-09 in `00-master-prd.md`. `shortDay` in `src/lib/league/days.ts` turns a day string into "Sun Oct 18" by arithmetic; the day headings, the "moved from" mark and a playoff game's slot use it. With `?team=<name>` the page shows that team's next game (the first on or after today in the season's timezone with no score) above its schedule. Under the season name is "Schedule updated" with the publish time in league time, and a "Changes this week" list of the games the shown version moved, new slot and old, for the 7 days PUB-02's mark lasts. The standings lose the "Why" column: the reason is under the team name. A division with a bracket has a "Playoff line: top n" row under place n. Playoff games are named Final, Semifinal 1, Quarterfinal 3 and "Round 1 game 2" by `roundName` in `src/app/l/public-league.ts`, and an undecided side reads "winner of Semifinal 1". The projection gains a division's `cut` and a match's `label`.

**Decided.** D-46, taken as defaults: the playoff line is the bracket's size and is absent before a bracket; "updated" is the publish time, not the last score; the team link stays `?team=<name>`.

**Measured.** Gate: lint 0 errors (1 warning, the template's), typecheck clean, 424 tests in 56 files (1 new, 3 extended), `foundation:drift` clean against v1.2.1. `e2e/public-league.spec.ts`: 3 passed (1 new, at 390 by 844: next game, day heading, updated line, reason under the name, document no wider than the window).

**Left behind.** No browser test shows the playoff line, a round name or the changes list; those are covered by the loader's integration test and were not looked at in a browser. The width check ran on a two-team season with short names; a long unbroken team name was not tried. The page still has no stylesheet. The playoff line follows the table as it is now, not the frozen seeding (D-46). The calendar feed and the commissioner's pages still show `YYYY-MM-DD`. Engine untouched apart from the one formatter in `days.ts`.

## L-031: a confirm line, and void a score entered on the wrong game (2026-10-13)

**Built.** Written first as SCORE-13 to SCORE-15 in `00-master-prd.md`, after the owner chose D-45. Migration `20261013000000_result_void` adds `GameResult.voided` and a check constraint: a void supersedes a row, has a reason and carries no score. `voidResult` in `seasons/result-actions.ts` writes that row and an audit entry (`result.voided`) in one transaction and maps the unique violation, as `recordResult` does. `recordResult` now reads a game whose newest row is a void as unscored: a plain entry is accepted and supersedes the void row, and a correction is refused. `SCORED` in `seasons/rainout-load.ts` is the one filter for "has a score"; the six readers that each spelled out "any result row" or "the row nothing supersedes" (standings and what-if, the bracket's unscored count, the rainout load and its displaced count, publish, the public page) now use it. On the season page every score form ends with a required tick box naming the teams, day, time and field, and a scored game has a "Void this score" form with a reason. Two integration tests in `tests/integration/results.test.ts`.

**Decided.** D-45: a voided game is unscored again everywhere; only the commissioner's history shows the void. Defaults inside it: the confirm line is checked by the browser only; plain Generate stays refused after a void; playoff scores are not voidable.

**Measured.** Gate: lint 0 errors (1 warning, the template's), typecheck clean, 423 tests in 56 files (2 new), `foundation:drift` clean against v1.2.1. `e2e/public-league.spec.ts` (the one spec that reads results through a changed loader): 2 passed.

**Left behind.** No browser test ticks the confirm line or voids a score; the markup was not looked at in a browser. The confirm line names the game, not the runs typed, so it does not catch a mistyped score on the right game. A void sends no notice. The history is ordered by entry time, not by the chain. Engine untouched: `src/lib/league` has no notion of a void, it is simply not handed the result.

## L-030: edit a team, flag a missing contact email (2026-10-13)

**Built.** Written first as SEASON-07 and SEASON-08 in `00-master-prd.md`. `editTeam` in `seasons/actions.ts` changes a team's name and contact email after a scoped lookup and maps the unique violation to the same message `addTeam` uses; a blank email clears it. Each team on the season page has an "Edit" disclosure with the two fields prefilled (commissioners only), and a team with no contact email says so beside its name, with what it costs: no notice when its games move. One integration test in `tests/integration/season-setup.test.ts`: rename, set and clear the email, a taken name and a bad email refused, another org's owner changes nothing.

**Decided.** Nothing new. Readings taken: a rename is allowed at any season status, since games, results and bracket rows point at the team id and every screen reads the name on read; the division cannot be changed here (that would move games); the flag is shown to every member but the email only inside the commissioner's form; the edit is not written to the audit log, the same as `addTeam`.

**Measured.** Gate: lint 0 errors (1 warning, the template's), typecheck clean, 421 tests in 56 files (1 new), `foundation:drift` clean against v1.2.1. `e2e/golden-path.spec.ts`: 1 passed.

**Left behind.** No browser test opens the edit form or asserts the flag; the markup was not looked at in a browser. A rename after publish sends no notice and is not in the audit log. Notices already queued in the outbox keep the old name and address. A team still cannot be deleted or moved to another division (L-036 covers withdrawal).

## L-029: no plain Generate once a game has a score (2026-10-13)

**Built.** Written first as GEN-08 in `00-master-prd.md`. `generate` now counts the season's `GameResult` rows after the scoped lookup and refuses when there is one, before feasibility and before anything is stored. The Generate section of the season page drops the "Generate draft" and "New seed" forms once a result exists and shows a sentence pointing to "Regenerate the rest" under the rainout tool; the feasibility line and the latest report stay. One integration test in `tests/integration/rainout.test.ts`: score one game, a plain run is refused and the season still has one version.

**Decided.** Nothing new. Readings taken: any result row counts, including a superseded one, since a correction is still a played game; the server refuses as well as the page hiding the buttons. A score can only be entered on a game in the published version, so "Regenerate the rest" is always available when plain generation is closed.

**Measured.** Gate: lint 0 errors (1 warning, the template's), typecheck clean, 420 tests in 56 files (1 new), `foundation:drift` clean against v1.2.1. `e2e/golden-path.spec.ts`: 1 passed.

**Left behind.** No browser test asserts the missing buttons or the sentence; the markup was not looked at in a browser. Playoff scores live on bracket rows, not `GameResult`, so they do not close plain generation (a season with playoff scores and no season scores is not a state the app reaches). A draft made by a plain run before the first score is still there; publish refuses it if it moves a scored game (L-017).

## L-028: results for tonight (2026-10-13)

**Built.** Written first as SCORE-10 to SCORE-12 in `00-master-prd.md`. The Results section of the season page now opens with a count of played games that have no score, then those games under a heading for each field in date and time order, then every other game in date order under "Scored and upcoming". A game after today (season timezone, the same `today` the rainout tool uses) has no score form; `recordResult` still refuses it. The ordering is one function, `resultsOrder` in `src/app/o/[org]/seasons/results-order.ts`, with `tests/unit/results-order.test.ts` (3 tests). No action, schema or engine change.

**Decided.** Nothing new. The row was specific enough; the only reading taken was that a scored game on or before today keeps its form, because that is where a correction is entered.

**Measured.** Gate: lint 0 errors (1 warning, the template's), typecheck clean, 419 tests in 56 files (3 new, in 1 new file), `foundation:drift` clean against v1.2.1. `e2e/golden-path.spec.ts`: 1 passed.

**Left behind.** No browser test asserts the new order, the field headings, the count or the missing form: the golden path loads the page and passes, but the markup was not looked at in a browser. Fields are ordered by name with plain string comparison. The list was unordered before (the query had no `orderBy`); it is now in date order, which nothing depended on.

---

## L-027: score entry fixes (2026-10-13)

**Built.** Six fixes from the scorekeeper persona review, written first as SCORE-04 to SCORE-09 in `00-master-prd.md`. `recordResult` and `recordBracketResult` read an empty run box as "not entered" and refuse it unless a forfeit is chosen; before, `z.coerce.number` read `''` as 0 and an untouched form saved 0-0. The season form's run boxes start empty and are labelled with the two team names, as is the forfeit choice, the result line and the history. With a score present the form opens with "correction" ticked and only then shows the reason field. A level score is followed by "(Tie)". History times go through a new `timeIn(tz, at)` beside `dayIn`, in the season's timezone. A playoff correction is refused without a reason and the reason is stored in the audit row.

**Decided.** D-44.

**Measured.** Gate: lint 0 errors (1 warning, the template's), typecheck clean, 405 tests in 53 files (403 before; 2 new and one extended), `foundation:drift` clean against v1.2.0. `e2e/golden-path.spec.ts`: 1 passed.

**Left behind.** No browser test drives the season score form; the golden path scores playoff games only and seeds season results in SQL, so the ticked box, the hidden reason field and the team-name labels were checked by reading the markup, not by a spec. The versions table on the same page still shows its times in UTC; the row asked for the result history only. The public page and standings page were not checked for "home/away" wording. A season correction's run boxes are empty while a playoff correction's are prefilled with the current score.

---

## L-025: LLM against the generator (2026-10-12)

**Built.** `scripts/league-bench.ts` (`npm run league:bench`, `--dry` for no calls): loads the demo season from the local database, gives it to Haiku 5.5, Sonnet 5.5 and Opus 5.5 three times each, and scores every answer with `scoreSchedule` beside `generateSchedule` at the demo seed. Spend is added up from each response's usage and checked before every call against the most that call can cost. Rows, usage, answers and the prompt are in `docs/bench-01-results.json`. `tests/unit/league-bench.test.ts` (3 tests): pricing, the short-name round trip, and a made-up slot reaching `scoreSchedule`.

**Decided.** D-43. D-42 was the owner's go-ahead.

**Measured.** One run on 2026-10-12, demo season dated 2026-09-22 to 2026-11-05: 51 games, 56 slots, 3 blackouts, a 10,344-character prompt. All 9 answers placed all 51 games with 0 hard violations. Soft cost, dollars, seconds: generator 122, $0, 0.64 s (301 before repair, 4,060 iterations, 29 accepted moves). Haiku 139, 146, 123; $0.030, $0.008, $0.023; 234, 63, 187 s. Sonnet 148, 156, 142; $0.143, $0.069, $0.264; 93, 37, 186 s. Opus 102, 100, 100; $0.817, $0.858, $0.605; 363, 371, 251 s. Total $2.8163 of the $10 cap; no call reached the 64k output cap (5,808 to 58,838 output tokens). The counted floor is 100 (rest rule only), so two Opus answers sit on it. Checked afterwards, not part of the 9 calls: the generator over seeds 1 to 20 finishes between 100 and 124, at 100 for two of them, in 0.39 to 0.76 s a seed; seed 2027 stays at 122 with 10,000 iterations. The `--dry` run before the calls timed the same generation at 6.1 s; the cause of the difference was not looked into. Gate: lint 0 errors (1 warning, the template's), typecheck clean, 403 tests in 53 files, `foundation:drift` clean against v1.2.0.

**Left behind.** One season, three runs a model, one prompt, one day: not a study. Nothing here says what a model does on a season with no publishable schedule, with pins, or at 200 games. The demo's seed (2027) is one of the generator's worse ones on this season and was not changed. The benchmark is not on a screen. `ANTHROPIC_API_KEY` was removed from `.env.local` after the run, on the owner's confirmation (D-42).

## L-026: crossover games between divisions (2026-10-12)

**Built.** A season setting, `crossoverRounds` (migration `20261012000000_crossover_rounds`, CHECK 0 to 16), a form for it on the season page, and `crossover()` in `src/lib/league/build-input.ts` (spec 01 §9): in each round every team of the smaller of two divisions plays one team of the other, no pair twice, host alternating, for every two divisions. A crossover game is key `X:a~b` with `Game.awayDivision`; `scoreSchedule` counts each side of a game in its own division for the two equity rules through one helper, `sides()`, which the quality table also uses. Nothing else in the generator, the repair loop or the reschedule changed. Standings: `StandingsConfig.countCrossover` (spec 02 §9) counts a result for the team that is in the list, in the table, the 'all'-scope steps and the points range; `loadStandings` passes it for every division, lists an open crossover game in both divisions' arithmetic and under the home side in the what-if form. The bracket page's "unscored" count and the public page's label ("Crossover") follow the teams, not the stored division.

**Decided.** D-40 (owner: crossover results count, D-22 stays the default) and D-41 (the shape, taken as defaults).

**Measured.** Sample league (9 and 6 teams, single round robin, 96 slots, seed 1, default caps), heuristic, no claim of best: without crossover 51 games, soft cost 32 before repair and 10 after, 1,788 iterations, 9 accepted, 281 ms; with 2 crossover rounds 63 games (12 crossover), soft cost 31 before and 3 after, 3,020 iterations, 13 accepted, 547 ms. Rest floor 0 in both. Gate: lint 0 errors (1 warning, the template's), typecheck clean, 400 tests in 52 files (11 new), `foundation:drift` clean against v1.2.0. `e2e/golden-path.spec.ts` and `e2e/public-league.spec.ts`: 3 passed.

**Left behind.** No e2e step sets crossover rounds in a browser; the path is covered by the integration tests on `generate` and `loadStandings`. The demo seed has no crossover games, and `docs/DEMO.md` and the exec brief do not mention them. Lowering the setting after a generation leaves the dropped pairings as `Game` rows with no placement, and the what-if form lists every unscored `Game` row, so they show there (the same is true of a division whose legs change). A crossover game appears once in the what-if form but counts toward the 12-game limit in both divisions. The rainout notice and compare screens were not looked at with a crossover game. Bracket seeding reads the standings as they are, crossover results included.

## L-024: calendar feed per team (2026-10-12)

**Built.** `teamCalendar(league, team)` in `src/app/l/public-league.ts` turns one team's games from `loadPublicLeague` into an iCalendar file, and `src/app/l/[org]/[season]/calendar.ics/route.ts` serves it at `?team=<name>` as `text/calendar` (ICAL-01). The public page shows a "Calendar feed" link once a team is picked. `PublicLeague` gained `timezone`, `gameMinutes` and `publishedAt`, and `PublicGame` gained `uid`, a hash of the game id. No engine change and no migration.

**Decided.** D-39, defaults where the PRD is silent: the URL and the team-by-name pick follow the page; regular-season games only; wall times with the season's `TZID` and no `VTIMEZONE` block; the event key is a hash of the game id and survives a reschedule; no scores in the feed.

**Measured.** Gate: lint 0 errors (1 warning, the template's), typecheck clean, 389 tests across 52 files (2 new, in `tests/integration/public-league.test.ts`), `foundation:drift` clean against v1.2.0. `e2e/public-league.spec.ts`: 2 passed in 8.2 s against the production build, now fetching the feed and adding its URL to the 404 list. The first full `npm test` was red on the template's INV-01..04 sweep (timed out at 180 s, then two controls failed behind it). The same file alone passed in 12 s and the second full run was green in 46 s with nothing changed; the cause was not established.

**Left behind.** The feed was not opened in a calendar app: Google, Apple and Outlook are expected to accept a `TZID` with no `VTIMEZONE`, and that was not tried. Lines fold at 73 characters, not 75 bytes, so a long non-ASCII team name can run over. Playoff games are not in the feed. A feed read costs what a page read costs (standings and brackets are computed and thrown away) and draws on the same 60 reads per 15 minutes per IP, which a calendar service polling for many subscribers from one address could use up. A renamed team breaks its subscribers' URL.

## L-022: closure (2026-10-12)

**Built.** No product code. `WRITEUP.md` finished (summary, what it is not, defects found, hardest bug, what is open). `docs/RELEASE_NOTES.md` with every closure artifact. The exec brief, "Bracketry in Brief", published as a private artifact with two screenshots taken from the seeded demo on the dev server (standings with the reason column; the quality page stating the floor). Two LinkedIn drafts in the Ledger, posts 114 (Impact, "never optimal") and 115 (AI, "no coin flip"), after 113 (AI), so no two adjacent drafts share a pillar. The cost review.

**Decided.** D-36: not deployed. D-37: nothing bills except CI minutes; the template's hourly cron is inert, with the schedule to change first if the project is ever deployed.

**Measured.** Gate re-run for the brief's numbers, not quoted from the docs: lint 0 errors, typecheck clean, 383 tests across 52 files, `foundation:drift` clean against v1.2.0. Seed on 2026-10-12: 51 games in 56 slots, 301 to 122, 4,060 iterations, 29 accepted, Comets, Hawks and Icemen level; the same as L-021. Vercel: no project. Neon: 0 of 19 projects named bracketry.

**Left behind.** The brief links the build log artifact in its footer; that link is dead for a reader until both pages are shared. The Ledger page has no `bracketry` entry in its project list, so the tag shows as the raw id and there is no filter chip (same as `loanbook`). The screenshots are hand-taken, not from a capture spec, and the screens are unstyled. The 138 in the brief is the L-002 count of tests written before their code; later suites added tests. P1 items L-023 to L-026 are not started. Everything listed under "Open" in `NEXT.md` stands.

## L-021: demo data and e2e (2026-10-12)

**Built.** `scripts/seed-bracketry.ts` (`npm run seed:bracketry`, and `:test`): the Eastside Rec Softball org, a commissioner who signs in at `/demo`, one season of seven weeks with A Division (the capstone's nine teams) and B Division (six), two fields, Tuesday and Thursday at 18:00 and 19:30, three blackouts and minimum rest 3. It calls `loadSeasonInput`, `generateSchedule` and `saveDraft`, the same three the Generate button calls, publishes the version, and writes a score for every game before today. Re-running replaces the league. `docs/DEMO.md`: the script, screen by screen, with accounts, troubleshooting and what to concede. `e2e/golden-path.spec.ts`: one spec, as the commissioner, through the forms: published version, Quality page, the tied teams in three consecutive ranks, makeup slots, a top-4 bracket placed and played to a champion, then a rained-out day, a proposed reschedule, the version comparison and a publish.

**Decided.** D-35: the season is dated around the day the seed runs; ids are fixed so the schedule is the same on every run; the tie is staged wherever three teams can be left level on their own; the capstone fixtures stay separate; the spec runs the seed as a process and moves playoff slot dates in the test database to score them.

**Measured.** Seed, same on three runs: 51 games in 56 slots at seed 2027, soft cost 301 before repair and 122 after, 4,060 iterations, 29 accepted moves, against the counted floor of 100. Seeded on Monday 2026-10-12: 22 games scored; Comets, Hawks and Icemen level on 4 points at ranks 3, 4 and 5, split by run differential among the three and then head-to-head, so the tie decides the fourth playoff place. Before ids were fixed the same seed gave 133 on one run and 122 on the next. `e2e/golden-path.spec.ts`: 1 passed (the test itself 2.6 s) against the production build; it failed twice first, once on the import and once on a locator that matched a row by another row's note. Gate: lint 0 errors (1 warning, the template's), typecheck clean, 383 tests across 52 files, `foundation:drift` clean against v1.2.0. Every command in `docs/DEMO.md` was run once.

**Left behind.** The rest of the e2e suite was not re-run locally; CI owns the sweep. The live demo cannot score a playoff game, so the champion is shown by the capstone command and by the spec only. The demo order with the rainout before the playoffs has not been driven in a browser. On a weekday where no trio qualifies the seed stops with a message; only Monday was tried. This is the first time the Rainout, Playoffs and Quality screens ran in a browser, and they needed no fix. `next dev` appends an agent-rules block to `CLAUDE.md` each time it starts; it was reverted, not committed.

## L-020: schedule quality table (2026-10-12)

**Built.** `src/lib/league/quality.ts`: `scheduleQuality(input, assignment)` returns the `scoreSchedule` report unchanged plus one row per team (games, home, away, games per start time, games per field, shortest and longest rest in days, bye weeks, soft violations naming the team), and `restFloor(input)` counts the `REST` violations any full legal schedule must carry. A loader (`seasons/quality-load.ts`) and a page (`seasons/[season]/quality/page.tsx`) show it for any version, with a version picker; each row of the Versions table links to it (QUAL-01, QUAL-02).

**Decided.** D-34, defaults where the PRD is silent: a page of its own; counted against the season as it is now, with the stored score shown beside it when the two differ; a bye is a calendar week with a slot and no game; one floor only, the rest rule, by counting, with every other rule taken as 0. The floor generalises spec §6.4 from "weeks" to runs of open days shorter than `minRestDays`, and allows for more than one game a day.

**Measured.** `restFloor` on the capstone returns 10 violations, cost 100, with T03 at 2 and every other team at 1: the figure worked by hand in spec §6.4. The generator's 114 at seed 2027 is therefore 14 above the floor. On 8 weeks, with the default `minRestDays` of 2, or with the rest weight at 0, it returns 0. Gate: lint 0 errors (1 warning, the template's), typecheck clean, 383 tests across 52 files (375 before: 5 in `tests/unit/league-quality.test.ts`, 3 in `tests/integration/quality.test.ts`), `foundation:drift` clean against v1.2.0. The first lint run was red on two unescaped apostrophes in the page; reworded.

**Left behind.** The page has not been opened in a browser and no e2e spec touches it. The floor says nothing about long gaps, equity or rematches, so a schedule at the floor may still not be the lowest cost there is. Rest and byes are counted over season games only; playoff games are not in the table. A version whose teams have since changed is counted against today's pairings, and the page says the inputs changed but not which.

## L-019: public league pages (2026-10-12)

**Built.** One anonymous page per season at `/l/[org]/[season]` (`src/app/l/[org]/[season]/page.tsx`) and its loader (`src/app/l/public-league.ts`). `loadPublicLeague(orgSlug, seasonId)` finds the season's published version through the org slug, reads that version's placements with each game's current score, and reuses `loadBrackets` for standings and brackets. Everything it returns passes through `toPublicGame`, `toPublicStanding` or `toPublicMatch`, each built on an empty default with fields opted in by name (spec §7c); the output holds names, days, times, fields and scores, and no ids. The page shows the schedule by day, the same list filtered to one team (`?team=<name>`), each division's table with the reason column, and each bracket with slots, scores and the champion. A game whose slot differs from the version the published one replaced carries "moved from <old slot>" (PUB-02). The season setup page links to the public page. `loadStandings` and `loadBrackets` now take `{ orgId }` instead of a full `OrgCtx`, since the public page has an org and no member.

**Decided.** D-33, defaults where the PRD is silent: the page is a route of its own, not a template share link (those are secret, expiring, and registered in `src/core`); a season is public once a version is published, with no opt-out switch; every miss is the same 404; reads share the template's per-IP share-read limit; the "moved from" mark lasts 168 hours from `publishedAt`; playoff games are listed in the bracket section only.

**Measured.** Gate: lint 0 errors (1 warning, the template's), typecheck clean, 375 tests across 50 files (369 before: 6 in `tests/integration/public-league.test.ts`), `foundation:drift` clean against v1.2.0. `e2e/public-league.spec.ts`: 2 passed in 11.2 s against the production build. This is the first page of the project opened in a browser by a test. The first run of the new integration file had one red test, and the test was wrong: with one game scored, `generateBracket` refused the top 2 because second place was a three-way tie.

**Left behind.** The rate limit is 60 reads per 15 minutes per IP, the template's share budget; a whole team on one field's wifi shares it, and a league-sized limit needs a new entry in the template's `LIMITS`. No caching: every read recomputes standings. The team filter is by name in the query string. A bracket seeded from standings that have since changed is shown as it is, with no public warning. The "moved from" mark compares against the last superseded version only, so two publishes inside a week drop the first one's marks. L-024's calendar feed can read `loadPublicLeague`.

## L-018: playoffs (2026-10-12)

**Built.** A Playoffs page per season (`seasons/[season]/bracket/page.tsx`), a loader (`seasons/bracket-load.ts`) and four actions (`seasons/bracket-actions.ts`). `generateBracket` takes the top N of a division from `loadStandings`, refuses while any of them is in an undecided tie (BRKT-01), calls `buildBracket`, and stores the seed order, the division table it came from and a sha256 of that table (BRKT-03, D-15). Calling it again regenerates, refused once any playoff game has a result. `placeBracketGames` hands every game of the bracket whose two teams are known, and that has no score and no usable slot, to the engine's `reschedule` as displaced games, on top of the published season and every other placed playoff game (BRKT-04). `recordBracketResult` and `clearBracketResult` lock the bracket row, rebuild the engine's bracket by replaying the stored results over the frozen seeds, make one engine call and write back every match (BRKT-05). The engine gained `clearResult` (17 lines), the gap L-009 left: it refuses while the next match has a result, and puts the "winner of" marker back in the next match. No migration: the L-000 schema already had both tables.

**Decided.** D-32, all defaults where the PRD is silent: seeding does not wait for every season game to be scored (the page counts the unscored ones); the fingerprint covers the whole division table and the warning says whether the seeds would change; a playoff game needs a slot on or before today to be scored; a slot holding a playoff game is not season inventory (`load-input.ts`); a closed playoff slot means "place it again"; a playoff correction updates the row and leaves the old score in the audit log, with no reason asked.

**Measured.** Gate: lint 0 errors (1 warning, the template's), typecheck clean, 369 tests across 49 files (363 before: 2 unit tests for `clearResult`, 4 integration tests in `tests/integration/bracket.test.ts`), `foundation:drift` clean against v1.2.0. The first gate run was red: the template's INV-01..04 sweep timed out at 180 s with the four new actions and no fixture rows for `ref('bracket')` and `ref('bracketGame')`. With the two rows added to `tests/fixtures/app.ts` the sweep takes 11 s. Why a missing fixture showed as a timeout and not as the harness's "no fixture row" finding was not established. No e2e run and the page was not opened in a browser; golden path 2 at L-021 is the first spec that reaches it.

**Left behind.** A draft schedule made before a playoff game was placed can still be published onto that game's slot: `publish` does not look at `BracketGame`. The public bracket page is L-019. Nothing notifies teams of a playoff slot or a change to one. Placement is one greedy pass in match order (lowest soft cost, earliest on a tie), not a search over the round. A bracket of another division whose game sits in a closed slot is left out of the engine input until its own bracket is placed again. The test session does not survive a clock jump of several weeks, so the bracket test signs in again after each jump.

## L-017: rainout tool (2026-10-12)

**Built.** A Rainout section on the season page and three actions in `seasons/rainout-actions.ts`. `closeDay` closes every open or makeup slot on a day and reports how many published games that displaces; a makeup slot is `addSlot` with `makeup=on`. `proposeReschedule` loads the published version through `seasons/rainout-load.ts`, calls the engine's `reschedule`, and stores the result as a new draft whose report carries each move and, for a game with no legal slot, the reason (`src/lib/league/unplaced.ts`, which asks `scoreSchedule` about every free slot, D-4). `regenerateRest` is the separate action (RAIN-05): a required confirmation, played games pinned where they were played, a full generation for the rest, and a report of how many unplayed games moved. `publish` now queues one notice per affected team through the outbox, in the publish transaction, naming each game with its old and new slot (RAIN-04, D-18); `notifications` is declared in `required-modules.ts`. The three draft-writing actions share `seasons/save-draft.ts`. 4 integration tests and 2 unit tests.

**Decided.** D-31: displaced means a closed slot and no score; a scored game is never displaced or moved; a reschedule ignores pins and closing a slot removes pins on it; a makeup slot may fall after the season's last day; publish refuses a stale draft (an unplayed game in a slot closed since, or a moved game scored since). D-23 as confirmed: free slots on or before today in the season timezone are not offered. `proposeReschedule` re-checks D-12 on every run and throws if any game that was not displaced changed slot.

**Measured.** Gate: lint 0 errors, typecheck clean, 363 tests green (357 before), `foundation:drift` clean against v1.2.0. No e2e run and the new section was not opened in a browser; no spec touches the season page until golden path 2 at L-021.

**Left behind.** Plain `generate` still ignores played games; after the first score, "regenerate the rest" is the action to use, and publish now refuses a draft that moves a scored game. A stale game (its teams changed after publishing) sitting in a closed slot is listed as displaced but the engine does not move it. Reopening a closed makeup slot turns it into an ordinary open slot. Only the latest version shows its reschedule detail on the page; older ones show through Compare. Notices are plain text through the `notice` template, email only.

## L-016: standings page (2026-10-12)

**Built.** `seasons/standings-load.ts` computes each division's table on read: the newest non-superseded `GameResult` per game plus the `TieResolution` log, through `computeStandings`, with team names swapped into the reasons (D-22). `seasons/standings-actions.ts`: `saveChain` (reorder the steps, restart or continue; after the first score it needs a reason, is guarded by `standingsConfigVersion`, bumps it, and writes an audit row holding before, after and the reason) and `recordTie` (the submitted teams must be exactly one group the engine reports unresolved right now; appends a `TieResolution`). Page at `seasons/[season]/standings`: table with a "why" per row, an unresolved-tie flag, the decision form, the chain editor. 4 new integration tests.

**Decided.** "Before the first game" means before the first result is entered, since the chain only matters once there is a result. The chain can be reordered but steps are not added or removed (D-14: a short fixed list, not a rules engine). Forms post `pos_<id>` fields, so both actions take loose schemas and validate the permutation in the body. The "logged change" is the audit log, not a new table.

**Measured.** Gate: lint 0 errors, typecheck clean, 357 tests green, `foundation:drift` clean. No e2e run; no spec touches this page yet (golden path 2 lands at L-021).

**Left behind.** Points, run-diff cap and forfeit settings (STAND-02) still have no editor; defaults apply. The audit rows for chain changes are not shown on the page. A later correction can leave a stored decision stale (it simply stops applying, per D-22).

## L-015: score entry (2026-10-12)

**Built.** `recordResult` action (`result-actions.ts`) and a Results section on the season page: a score form per game in the published version, the current score, and the history of a game's result when it has been corrected. Runs or a forfeit; only games on or before today in the season timezone (`Intl` with the explicit zone, injected `now()`); a second score is refused unless marked a correction with a reason; a correction supersedes the newest row. Unique violations (one original, superseded once) map to a "someone else just scored this game" refusal. 5 integration tests including the midnight boundary in Chicago.

**Decided.** D-30: commissioners (`org.update`) enter scores; no template edit, scorekeeper role deferred.

**Measured.** Gate: 353 tests green, drift clean.

**Left behind.** No scorekeeper (member) role (D-30). Standings are not shown yet (L-016). Playoff results are L-018. Results for a game whose placement later leaves the published version stay stored but are not listed on the page.

# Progress

## L-014: versions and publish (2026-10-12)

**Built.** `publish` (gate: `isPublishable` on the stored report; one transaction supersedes the previous published version, then publishes this draft with a reason and `publishedAt` from the injected clock; the partial unique index violation is mapped, never checked first), `setPin` and `removePin` in `seasons/version-actions.ts`. `compareAssignments` (pure, `src/lib/league/compare.ts`). `loadSeasonInput` now loads pins into `buildInput`, so generation works around them and `inputHash` changes with them. The season page has a version table (number, status, seed, fingerprint, who, when, why, score), a compare form (`?a=&b=`) and a pins section.

**Decided.** D-29: compare by game key and slot identity, with stored home/away (resolves the D-28 note); a pin is legal when `scoreSchedule` finds no hard violation over the existing pins plus the new one; only a draft can be published.

**Measured.** Gate: 348 tests green (5 new: 1 compare unit, 4 integration on publish, supersede, the one-published index, illegal and kept pins), lint 0 errors, drift clean.

**Left behind.** No e2e spec (lands with L-021). Compare lists moved games as sentences, no side-by-side grid. Violation sentences from an illegal pin replace team ids only. A stale pin (its slot closed later) surfaces as a hard violation on the next generation rather than being dropped.

## L-012: season setup (2026-10-12)

**Built.** `/o/[org]/seasons` (list, new season) and `/o/[org]/seasons/[season]` (divisions and teams, fields, weekly slot patterns, single slots with close and reopen, per-team blackouts and a bulk holiday, the rules form with defaults). Eleven actions in `seasons/actions.ts`, all `orgAction('org.update')`. `materializeSlots` in `src/lib/league/materialize.ts` (pure) turns a weekly pattern into slot rows across the season window. `tests/fixtures/app.ts` now seeds a season, division, team, field and slot in both harness orgs. A Seasons link in the org nav.

**Decided.** D-27: commissioner = `org.update`, so no template file is edited. Day and time formats are checked in the action body after the scoped lookup, not in the schema, because the harness feeds `'x'` to a plain string and a schema-level refusal would hide the cross-org check (INV-02/03/04). A row that is not the org's is `notFound()`, never a domain error. A rerun of a weekly pattern is refused as a duplicate; slots a manual add or an earlier pattern already made are skipped. Makeup slots are left alone by close and reopen (L-017).

**Measured.** INV-01 to INV-04 and INV-22 pass over all eleven new actions (14/14 in the harness file). Gate: lint 0 errors, typecheck clean, 333 tests across 40 files, `foundation:drift` clean. The full `npm test` ran in one pass with no slow outlier this time.

**Left behind.** No close-a-slot guard for a slot that already holds a pin or placement: nothing is placed until L-013, and the rainout tool (L-017) owns displaced games. No edit or delete for teams, divisions, patterns or blackouts, and no season status change (setup to active comes with publish, L-014). The scorekeeper permission is raised at L-015 (D-27).

## L-011: data model and migrations (2026-10-08)

**Built.** `prisma/schema/bracketry.prisma`: the fifteen §8 entities, five enums, every table with `orgId` and a cascade to `Org` (fifteen `// app` back-relation lines in `core.prisma`, the only template-owned edit, which the drift check excuses). One migration, `20261008000000_league_init`: about 500 lines are Prisma's own diff and the last 50 are hand-written (two partial unique indexes, the shared append-only trigger function and its two triggers, twelve CHECK constraints). `tests/integration/league-constraints.test.ts`: 18 tests that insert conflicting rows with raw SQL and assert the refusal by constraint name. The entity list and the SQL were shown to the owner first and confirmed.

**Decided.** D-24 (the engine's slot id is `day|start|fieldId`, which closes the L-007 ordering question with no column), D-25 (the append-only triggers let a foreign-key cascade through; owner's choice) and D-26 (the constraints beyond §8; owner's choice). Smaller readings: `createdBy`, `enteredBy` and `decidedBy` are user ids with no foreign key, as `AuditEvent.actorUserId` is. `seed` is `BIGINT` with a uint32 CHECK, because a mulberry32 seed can exceed a signed 32-bit integer. The same-game foreign key on corrections kept Prisma's name, `GameResult_supersedesId_gameId_fkey`, not the name in the plan. `Pin` to `Game` and `FieldSlot` is one-to-many in Prisma (a composite key cannot be declared one-to-one); the column's own unique index is what limits it to one.

**Measured.** 18 of 18 constraint tests green on the first run, each matching the constraint it names. `prisma migrate diff` from the migrated test database to the schema is empty, so the hand-written indexes and checks do not read as drift. The cascade exemption was checked on Postgres 17.11 before the plan was shown. Gate: lint 0 errors (1 warning, in the template's `e2e/billing.spec.ts`), typecheck clean, 325 tests in 38 files, drift clean against v1.2.0. The suite's reset matters: with the template's `resetAuthTables` (a TRUNCATE of all 30 tables) the 18 tests took 26.7 s; deleting the orgs and letting the cascade empty the league tables takes 0.4 s.

**Left behind.** The first full `npm test` after the migration took 369 s and the second 29 s; the cause is unknown. A TRUNCATE of all tables timed at 25 ms in `psql` with rows present, there was no memory pressure, and the Postgres log shows no lock cancellations, so none of the obvious explanations hold. Watch the duration at L-012, whose tests will reset league rows. A playoff game and a regular-season placement sharing one slot is not refused by the database (two tables); L-018 checks it through `scoreSchedule`. There is no trigger on `Placement`: "never updated" is an app rule. `prisma format` realigns `core.prisma` and must not be run across the whole schema folder. No seed data yet, so the L-010 note about one source for the capstone season moves to L-021.

## L-010: engine capstone (2026-10-08)

**Built.** `npm run league -- capstone [--seed 2027]`, in `scripts/league-capstone.ts` (about 180 lines) and registered in `scripts/league.ts`. One pure function, `capstone(seed)`, returns the whole report as a string and the command prints it. Six sections: feasibility with its arithmetic, the generated season (draft and repaired scores, iterations, accepted moves, the floor, the calendar), seeded results, standings with a reason on every row, a six-team bracket played to a champion, and a rainout. It imports the season from `tests/unit/league-fixtures.ts`, so the demo and the unit suites generate the same league. Teams print as names (Aces to Icemen for T01 to T09); the engine still sees ids. `tests/integration/league-capstone.test.ts` runs it twice at seed 2027 and compares the full text, checks a different seed gives different text, and checks for a champion line, a publishable schedule and no leaked team id.

**Decided.** D-23, where the spec is silent: the caller keeps past open slots out of the reschedule inventory. The first run moved a game rained out of Thu Apr 15 to Tue Apr 13, two days before the rain, because `reschedule` offers every free slot and has no clock. That is the engine working as specified, so nothing in `src/lib/league` changed; the capstone drops open slots before the rain day and keeps slots that hold a game. It needs the owner's confirmation before L-017 builds on it. Smaller choices: the forced tie is three teams drawn from the seed that each beat the other six and beat each other in a circle with margins 4, 3 and 2, so points and head-to-head are level, run differential among the tied teams places the first, and the restarted chain splits the other two on head-to-head. The rainout hits the busiest day (the earliest of them), which gives four games to move instead of the one that Apr 22 gave at L-007. The floor of 100 is a constant with spec 01 §6.4's sentence beside it, not computed: counting forced short rests in the script would be a second copy of a rule (D-4). If a tie among the top 6 were unresolved the script prints a refusal and skips the bracket (BRKT-01); seeds 1, 2, 3, 7 and 2027 never hit it.

**Measured.** Seed 2027: 36 games, 56 slots, capacity 56. Draft 320, repaired 114 (REST 110, SLOT_EQUITY 4), 2,508 iterations, 22 accepted moves, floor 100, fingerprint `0bc6a015dea4784e`. Tie: Aces, Dukes and Falcons at 7-1, 14 points; Aces 1st on run differential among the three, Dukes 2nd on head-to-head. Champion: Dukes, the 2 seed. Rainout of Thu Apr 15: 4 games moved to Sat May 29, 32 of 32 other games kept their slot, soft cost 114 before and 81 after. 81 is under the floor because the makeup Saturday is an eighth week and the floor was counted for seven; the output says so. Seeds 1, 2 and 3 repair to 110, 102 and 120 and score 82, 94 and 108 after their rainouts. The test's three runs take about 0.9 s. Gate: lint 0 errors (1 warning, in the template's `e2e/billing.spec.ts`), typecheck clean, 307 tests across 37 files, `foundation:drift` clean against v1.2.0.

**Left behind.** D-23 is unconfirmed. A script importing from `tests/` is unusual; if the season moves into seed data at L-011, both should import it from there. Playoff games are not placed into slots (that is L-018). The results are simulated for every game whether or not it was placed, which only matters for a seed that leaves a game unplaced, and none tried does.

## L-009: brackets (2026-10-08)

**Built.** `seedOrder`, `buildBracket`, `recordResult` and `champion` in `src/lib/league/bracket.ts` (spec 02 §5 to §7), about 85 lines. `seedOrder` is the spec's recurrence as a loop: start from `[1, 2]` and replace each seed `s` with `s, n + 1 − s` while doubling `n`. `buildBracket` sizes to the smallest power of two, turns seed numbers above the team count into byes, and builds each later round from the one before, so a bye match sets its winner at build time and that team is already in its round-2 slot. `recordResult` clones the bracket, refuses an unknown match, a match whose two slots are not both teams (a bye, or waiting on an earlier game), and equal runs without a forfeit, then writes the winner into its next slot with its original seed. A correction is the same call again and is refused once the next match has a result (BRKT-05). `champion` is the final's winner or null. Suite renamed `.pending.ts` to `.test.ts`; it was the last pending suite.

**Decided.** Nothing that needs a decision row. Two readings worth recording. First, NEXT.md for this item said `seedOrder` takes `StandingsRow[]`: it does not. The type contract is `seedOrder(size: number)` and `buildBracket(teams: TeamId[])`, so a shared rank never reaches the engine. BRKT-01 already settles it: the bracket is blocked while any included team needs a commissioner decision, and that check belongs to the caller (L-010 for the capstone, L-018 for the app). Second, the forfeit rule is read before the runs, so `{ aRuns: 0, bRuns: 0, forfeit: 'a' }` is not a tie.

**Measured.** Red first: 17 tests, 13 NotImplementedError and 4 on `expected false to be true`. Those 4 are the tests that only assert a refusal (bad size, tie, unknown or waiting match, bye match), and `refuses()` returns false for a stub by design, so they were red for the right reason. Green: 17/17 with no expected value changed and no test added. Gate: lint 0 errors (1 warning, in the template's `e2e/billing.spec.ts`; the 6 that went were the stub's unused parameters), typecheck clean, 306 tests across 36 files, `foundation:drift` clean against v1.2.0. `pending:check`: no pending suites left.

**Left behind.** The spec says a refused correction needs "the later result cleared first", and there is no function that clears a result: L-018 has to add one or raise it. Runs are not validated here (negative or fractional runs are accepted); that is the score-entry boundary's job. `Bracket` carries no standings fingerprint, so the frozen snapshot of D-15 is something L-018 stores beside it. `pending:check` crashed with no pending suites (it read a report Vitest never wrote); it now says so and exits 0, and can be deleted along with `vitest.pending.config.ts` whenever convenient.

## L-008: computeStandings (2026-10-08)

**Built.** `computeStandings` in `src/lib/league/standings.ts` (spec 02 §1 to §4). One `tally` function builds the table: played, W/L/T, points, raw runs for and against, and the margin clamped to ±`runDiffCap`. A forfeit is a win and a loss whatever the forfeit score, and enters the runs only when `forfeitCountsInRuns` is set. `tally` drops any result naming a team outside its list, so calling it with a tied group is the 'tied' scope: there is no second counting path. `resolve(group, step)` follows the spec's pseudocode line for line: skip a tied-scope step until the group is balanced, split by value best first, restart or continue for a part still tied, then a manual resolution or a shared rank. Suite renamed `.pending.ts` to `.test.ts`. The counting was restated to the owner and confirmed before any code was written.

**Decided.** D-22, where the spec is silent. Two manual resolutions for the same teams: the last one wins. Team id order is code-unit order (`sort()`), not `localeCompare`, so it cannot change with the locale. A forfeit counts as a meeting for the balanced check. Notes: "1st via head-to-head over B", "2nd via head-to-head behind A", "3rd via overall runs allowed over B", "4th on points", "1st by commissioner decision over A", "1st, tied with C: no tiebreak step separates them". Nothing is drawn at random: there is no PRNG import in the file.

**Measured.** Red first: 13 tests, 13 NotImplementedError. Green: 16/16 (13 from the suite with no expected value changed, plus 3 added for the choices above, each worked from ST-4). Gate: lint 0 errors (7 warnings, down from 10: the stub's unused parameters are gone), typecheck clean, 289 tests across 35 files, `foundation:drift` clean against v1.2.0. `pending:check`: 17 tests in one suite, 13 NotImplementedError.

**Left behind.** Notes carry team ids; L-016 (standings page) must substitute names. The caller passes current results only: `GameResult` has no id or `supersedesId`, so dropping superseded rows is the loader's job (D-13). A result where home and away are the same team is not rejected here. Each tied-scope step re-tallies the results for its group, which is nothing at league size (tens of games).

## L-007: reschedule (2026-10-08)

**Built.** `reschedule` in `src/lib/league/schedule.ts` (spec §7). A game is displaced when its slot is in `removedSlotIds` or is no longer in the inventory. The displaced games are lifted out, and each in turn is tried in every free slot: it takes the one that adds no hard violation and gives the lowest soft cost, the earliest in (day, start, field) order on a tie, and is unplaced when there is none (D-9). Legality and cost are both `scoreSchedule` on the candidate assignment (D-4); the "adds no hard violation" baseline is the same one `greedyDraft` uses, and `bySlot` is reused. No other game is touched (D-12). Suite renamed `.pending.ts` to `.test.ts`.

**Decided.** Where spec §7 is silent. `seed` is not read: the spec describes no random choice, so the result is a function of the other inputs, and a test asserts that two seeds give the same result. The removed slots are not in the request (only their ids are), so "order of old slot" is the order of the old slot ids, then game key; that is (day, start, field) order while ids are `day|start|field`, as in the fixtures. The pass is greedy, one game at a time against the games already settled: it does not search for the best joint placement of all displaced games (D-5). A displaced pinned game comes back unplaced, because any other slot is `PIN_MOVED` and its own slot is gone (D-21). Result `unplaced` lists displaced games only, in the order tried; `report.unplaced` lists every unplaced game. A game that was already unplaced stays unplaced, and a non-displaced game with a hard violation of its own (a blackout added later) stays put and stays reported: both are "regenerate the rest", a different action (RAIN-05).

**Measured.** Red first: 2 tests, 2 NotImplementedError. Green: 3/3 (2 from the suite, plus one added and worked by hand: Wed costs REST 10, Fri costs 0 on both fields, the game goes to Fri F1). Capstone at seed 2027, Thu Apr 22 rained out: 1 game displaced (`L1:T07~T09`; the generator had left that day nearly empty). The schedule scored 114; the 35 games that stay score 105 on their own.

| Inventory after | Free slots | Moved to | Unplaced | Hard | Soft after | Wall time |
|---|---|---|---|---|---|---|
| 4 Saturday makeup slots (May 29) | 21 | `2027-05-29|09:00|F1` | 0 | 0 | 107 | 3 ms |
| no makeup slots | 17 | `2027-05-20|19:30|F1` | 0 | 0 | 114 | 2 ms |

Gate: lint 0 errors (10 warnings), typecheck clean, 273 tests across 34 files, `foundation:drift` clean against v1.2.0. `pending:check`: 30 tests in two suites, 26 NotImplementedError.

**Left behind.** If the app's slot ids are database ids rather than `day|start|field`, "order of old slot" becomes id order, which is deterministic but not calendar order. L-011 or L-017 should either build engine slot ids from (day, start, field) at the boundary or raise a change to `RescheduleRequest` to carry the removed slots. One full `scoreSchedule` call per (displaced game, free slot): 3 ms here, and a whole rained-out day of 4 games against 20 free slots is about 80 calls. Entries in `current` for games not in `input.games` are carried through untouched.

## L-006: repair loop (2026-10-08)

**Built.** `greedyDraft`, `repair` and `generateSchedule` in `src/lib/league/schedule.ts` (spec §5). The draft places pins, then each game in (round, key) order into the first free slot in (day, start, field) order that adds no hard violation. Repair is a local search over the three spec moves (MOVE to a free slot, SWAP two games, PLACE an unplaced game with the occupant sent to a free slot or to unplaced), one candidate per iteration, each scored by a full `scoreSchedule` call and kept only when strictly better on (hard, unplaced, soft). Legality in the draft and every cost in the loop come from `scoreSchedule` (D-4). Suite renamed `.pending.ts` to `.test.ts`. The move set and the ordering rules were shown to the owner and approved before the loop was written.

**Decided.** Search order, chosen by the owner: violation-guided 80/20. The focus game is one the current report blames 80% of the time (hard violations first, then soft; an equity violation names no games, so it blames every game of its teams) and any movable game 20%; then an even choice between MOVE and SWAP. The 80/20 split and the even choice are untuned. One change from what was shown: when games are unplaced, PLACE takes half the iterations rather than all of them, so a season that cannot be completed still has its soft cost worked on. Determinism (D-3): one `mulberry32(seed)` per call is the only source of choice; every pool it indexes is an array sorted first (games by key, slots by day, start, field); Sets are membership only; stop conditions are counts, no clock. A pinned game is never a candidate and a pinned slot never a target. The two `reschedule` tests moved unchanged into `tests/unit/league-reschedule.pending.ts` so this suite can be green while `reschedule` is a stub.

**Measured.** Red first: 15 tests, 15 NotImplementedError. Green: 14/14 (13 from the suite, plus one added: reversing the input arrays gives the same fingerprint). Capstone, default bounds, floor 100 (spec §6.4), wall time on the laptop inside Vitest:

| Seed | Soft before | Soft after | Iterations | Accepted | Wall time |
|---|---|---|---|---|---|
| 2027 | 320 | 114 (REST 110, SLOT_EQUITY 4) | 2,508 | 22 | 281 ms |
| 1 | 320 | 110 | 3,355 | 26 | 336 ms |
| 2 | 320 | 102 | 3,093 | 29 | 430 ms |
| 3 | 320 | 120 | 2,741 | 22 | 268 ms |

Every run stopped on patience (1,500 iterations with no accepted move), not on `maxIterations`. None reached the floor of 100; seed 2 came closest, with REST at the floor and 2 of field equity on top. 12 teams over 10 weeks at seed 1: 382 to 138 in 3,252 iterations, 622 ms. The impossible season (9 teams, 4 weeks, seed 1): 4 unplaced before and after, 0 hard, soft 308 to 280. Gate: lint 0 errors (11 warnings), typecheck clean, 270 tests across 33 files, `foundation:drift` clean against v1.2.0. `pending:check`: 32 tests in three suites, 28 NotImplementedError.

**Left behind.** `repair` does not move a pinned game that arrives off its pin or unplaced: it stays reported (`PIN_MOVED`, or unplaced per D-21) and the loop works around it. Refusing an illegal pin is L-014. No incremental scorer (spec §8 does not require one); marked with a `ponytail:` comment naming the 5 s trigger from D-17. The D-17 cap on `maxIterations` is enforced by the caller (L-013), not here. No `league generate` CLI command: the capstone script is L-010.

## L-005: scoreSchedule (2026-10-08)

**Built.** `scoreSchedule` in `src/lib/league/schedule.ts`: the six hard codes and five soft codes of spec §4, each violation with a full-sentence `detail`. Suite renamed `.pending.ts` to `.test.ts`. The counting was restated to the owner and confirmed before any code was written.

**Decided.** D-21: an unplaced pinned game is unplaced only, not `PIN_MOVED`. Where spec §4 is silent: a division's teams are every team in any of its input games, placed or not (a team with nothing placed counts 0); a weight of 0 emits no violation rather than a cost-0 one; one `Violation` per group (slot, team-time, team-day, division-start or division-field) with `cost` = its units; hard violations come out in the §4.1 table order then by sorted key, and a (day, start) tie in a team's game order breaks by game key (D-3); assignment and pin keys not in `input.games` are ignored; duplicate blackout rows count once.

**Measured.** Red first: 11 tests, 11 NotImplementedError. Green: 11/11. The §4.3 bad schedule scores 6 hard (1 `SLOT_DOUBLE_BOOKED`, 2 `TEAM_SAME_TIME`, 2 `TEAM_DAY_LIMIT`, 1 `BLACKOUT`) and 31 soft (`REST` 30, `FIELD_EQUITY` 1), unplaced `['L1:B~C']`, matching the hand count line by line with no fixture value touched. Gate: lint 0 errors (16 warnings, unused params in the remaining stubs), typecheck clean, 256 tests across 32 files, `foundation:drift` clean against v1.2.0.

**Left behind.** No `league score` CLI command: the backlog row does not ask for one. Spec §4.2's sample sentence says "minimum 3" while the default `minRestDays` is 2; read as illustrative wording, not changed.

## L-004: feasibility (2026-10-07)

**Built.** `checkFeasibility` in `src/lib/league/feasibility.ts`: the three necessary conditions of spec §3 in spec order (teams in id order), each shortfall with a full-sentence `detail` carrying its numbers. `npm run league -- feasibility <file.json>` reads a `ScheduleInput` and prints the report. Suite renamed `.pending.ts` to `.test.ts`.

**Decided.** The team set is derived from the games (a team with no games is not counted in daily capacity). The pass message says "could fit" and that the generator may still leave games unplaced (D-8).

**Measured.** Red first: 5 tests, 5 NotImplementedError. Green: 5/5. Gate: lint 0 errors, typecheck clean, 245 tests across 31 files, `foundation:drift` clean. Report for 9 teams over 4 weeks: 36 games, 32 slots, `SLOTS_SHORT` by 4 and `DAILY_CAPACITY_SHORT` by 4.

**Left behind.** Nothing.

## L-003: round robin (2026-10-07)

**Built.** `gameKey` and `roundRobin` (circle method, last seat fixed, odd counts get a bye seat) in `src/lib/league/round-robin.ts`; `npm run league -- pairings --teams N [--legs 2]` prints rounds and byes. Suite renamed `.pending.ts` to `.test.ts`.

**Decided.** Spec §2 does not say which seat is fixed or which way the rest rotate; fixed = last seat, rotation by +1 per round. The suite and the spec's properties do not depend on it. Leg 2 is built by mirroring leg 1's home/away, round offset `m − 1`.

**Measured.** Red first: 77 tests, 77 NotImplementedError. Green: 77/77. Gate: lint 0 errors (19 warnings, all unused params in the remaining stubs), typecheck clean, 240 tests across 30 files, `foundation:drift` clean against v1.2.0. `pending:check` now covers 61 tests in five suites.

**Left behind.** Nothing.

## L-002: guard rails (2026-10-06)

**Built.** ESLint block scoped to `src/lib/league/**` banning `Math.random`, `Date.now`, argument-less `new Date()`, and imports from `@/core`, `@/app`, `@/modules` and Prisma (D-3). `scripts/league.ts` CLI skeleton (`npm run league -- <command>`, no commands yet). `npm run pending:check` runs the pending suites through `vitest.pending.config.ts` and prints, per suite, NotImplementedError vs other failures.

**Decided.** `new Date('2026-01-01')` is not banned by the rule (only the clock-reading no-arg form); D-6 still forbids it by convention. Pending suites run with no setup file, so they need no database.

**Measured.** `pending:check`: 138 tests, 133 NotImplementedError, 5 other failures (the "refusal" tests, which fail on their assertion). Per suite: bracket 17 (13/4), feasibility 5 (5/0), generate 15 (15/0), round-robin 77 (76/1), score 11 (11/0), standings 13 (13/0). Lint rule verified against a probe file: all five banned forms flagged, `new Date('...')` correctly not.

**Left behind.** Nothing. The CLI has no commands until L-003.

## L-013: generation console (2026-10-12)

**Built.** `src/lib/league/build-input.ts` (pure): rows → `ScheduleInput` with D-24 slot ids `day|start|fieldId`, `capRefusal` (D-17: 16 teams per division, 200 games, 10,000 iterations), and `inputHash`. `seasons/load-input.ts` loads a season scoped to the org; `seasons/generate-actions.ts` checks caps and feasibility, generates with a seed (blank = new), and stores a draft `ScheduleVersion` with seed, input hash, fingerprint, report, iterations, accepted, plus its placements and an audit row in one transaction. The season page shows live feasibility, before/after hard, unplaced and soft cost, iterations and accepted moves, every remaining violation in a sentence, and a "New seed" button. 14 new tests (unit: builder, hash, caps; integration: stored draft, same seed reproduces fingerprint and input hash, infeasible and cap refusals, foreign org).

**Decided.** D-28.

**Measured.** 12 teams, 66 games, 42 slots, 10,000-iteration cap: 445 ms (3,361 iterations before patience stopped it), well under the 5 s D-17 limit. Gate: 343 tests green, drift clean.

**Left behind.** Pins are not loaded into the input (L-014). No e2e spec for the console yet; it lands with L-021's golden path. Violation sentences still carry field ids; only team ids are replaced with names.

## L-023: what-if standings and clinch flags (2026-10-12)

**Built.** `pointsRankRange` in `src/lib/league/standings.ts` (spec 02 §8, fixture WI-1): best and worst rank on points over every win, tie and loss of the unplayed games, null above `ENUMERATION_LIMIT` (12). `loadStandings` takes optional hypothetical scores, adds them to the played results for unplayed games only and returns each division's open games and range. The standings page gains a "What if" GET form (a score per open game, and the cut line), a "Top n" column, a banner while any score is hypothetical, and the sentence saying how the flags are worked out and when they are missing. WHATIF-01 is `computeStandings` with more results; no second table function.

**Decided.** D-38. The project was reopened for this item by the owner (2026-10-12).

**Measured.** 9 teams and 12 open games (531,441 outcomes): 380 to 530 ms over three runs on the laptop. Gate: lint 0 errors, typecheck clean, 387 tests in 52 files, `foundation:drift` clean against v1.2.0. `e2e/golden-path.spec.ts`: 1 passed.

**Left behind.** The flags are conservative by design: a team that gets in only through a tiebreaker is never marked clinched. The enumeration runs on every read of the page with no cache. The e2e step checks the cut line and the column, not a typed hypothetical score; that path is covered by the integration test on the loader. Not on the public page.

