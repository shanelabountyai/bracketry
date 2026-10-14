# NEXT

The P0 backlog is done and the project was closed at L-022 (2026-10-12), then reopened by the owner for P1; every row is now ✅ except L-041, which is ✖ (not built while D-36 stands, D-56). L-040 was built on 2026-10-14 on `saas-foundation` v1.3.0 (D-55). Closure artifacts are in `docs/RELEASE_NOTES.md`. Not deployed (D-36); nothing bills except CI minutes (D-37).

PICK UP HERE: the owner's finalize list, items 5 and 6. (5) Seed the demo, start the production build, and retake the exec brief's screenshots (standings with the reason under the team name, the quality page with the floor) plus one each of a withdrawal, a preview link and crossover rounds, into `docs/screenshots/`. (6) Ask the owner before deleting `~/Projects/_to_delete_bracketry` and `~/Projects/bracketry-starter`.

Needs the owner: the exec brief is private until shared, and its footer links the build log, which a reader can only open once that page is shared too. The Lumen 25% utilization figure in Ledger post 114 is the owner's and was not checked. D-31 to D-35 were taken as defaults; say so if any part should change. D-33's main call: a season is public as soon as a version is published, with no opt-out. `next dev` appends an agent-rules block to `CLAUDE.md` on every start; it has been reverted each time.

Open from L-040: a scorekeeper can read the setup, rainout and standings pages; only the forms are hidden and the actions refuse. Nothing about the role is in `docs/DEMO.md` or the exec brief yet. Other clones owe `saas-foundation` v1.3.0 by 2026-10-21 (template work, in each clone's own session).

Open from L-039: D-53's defaults (publish permission to make or revoke; 404 once the draft is published, with no redirect; 1, 7 or 30 days; moved games compared with the published version; no calendar feed in a preview); confirmed by the owner (D-54). A draft that is never published keeps its link alive until expiry or revoke. `noindex` and `no-referrer` are meta tags on the page, not headers.

Open from L-036: D-52's defaults (the withdrawn team is listed under the table with its record, not ranked; refused while a game on or before today has no score; no undo; opponents are told at publish and the withdrawn team is not); confirmed by the owner (D-54). Before a version is published a team still cannot be removed. A team that withdraws after a bracket is seeded stays in the bracket: its playoff games are forfeited by hand, and only the D-15 warning says so. Until the draft is published the forfeited games show on the public page as forfeits on their future dates; after it they are in no list, only in the table's numbers. A withdrawn team's `?team=` link and calendar feed stop resolving, because the public team list is the ranked rows; not tried. The fairness tables were not looked at with a withdrawn team. Voiding a withdrawal forfeit after the draft is published leaves a game with no score that is off the schedule.

Open from L-018: when a new action file adds a `ref('<model>')`, add the fixture row to `tests/fixtures/app.ts` first.

Open from L-019: public reads share the template's 60-per-15-minutes per-IP limit; a league-sized limit is a template edit.

Open from L-021: the seed was only tried on a Monday; on a weekday where no trio can be left level it stops with a message (change `SEED`). The demo order with the rainout before the playoffs has not been driven in a browser. A playoff game cannot be scored live; the spec moves the slot's date in the test database.

Open from L-023: clinch flags are on points only and never count a tiebreaker (D-38). The enumeration is uncached, about 0.4 s per division at 12 open games.

Open from L-024: the feed was not opened in a calendar app (TZID with no VTIMEZONE block, D-39). One full `npm test` timed out in the template's INV-01..04 sweep and passed on the rerun; cause not established.

Open from L-026: D-41 was taken as defaults (one season-wide `crossoverRounds`, every two divisions, no chosen crossover week); say so if any part should change. Crossover rounds are set in a browser only on a copied season with no schedule; no crossover season is generated there. The demo seed has no crossover games. Lowering the setting after a generation leaves the dropped pairings in the what-if form.

Open from L-025: one season, nine calls, one prompt (D-43); nothing was measured on an impossible season, pins or a larger league. Opus matched the counted floor of 100 twice where the demo seed gives 122; seeds 1 to 20 give 100 to 124, so the demo's seed 2027 is one of the generator's worse ones and was left alone. `docs/DEMO.md`, the exec brief (version 2) and Ledger draft 116 now carry the result. The generator timed 6.1 s in the dry run and 0.64 s in the real one; not looked into.

Open from L-027: D-44 was taken as defaults (the server, not the browser, refuses an empty run box; a season correction's boxes are empty, a playoff correction's are prefilled); confirmed by the owner (D-54). No browser test drives the season score form. The versions table still shows UTC.

Open from L-028: no browser test asserts the results order or the field headings (the unscored count and the missing form on a future game are asserted, 2026-10-14).

Open from L-030: A rename is not audited and sends no notice; notices already in the outbox keep the old name and address. A team cannot be deleted or moved to another division.

Open from L-031: D-45's defaults (the confirm line is checked by the browser only; plain Generate stays refused after a void; playoff scores are not voidable); confirmed by the owner (D-54). The confirm line names the game, not the runs typed. A void sends no notice.

Open from L-032: D-46 was taken as defaults (the playoff line is the bracket's size and absent before a bracket; "updated" is the publish time, not the last score); confirmed by the owner (D-54). The width check ran with two short team names. The page has no stylesheet.

Open from L-035: every public read scores the whole published version and reads every version's report; not timed, not cached. The table ignores `?team=`. A placement whose game is no longer a season pairing is left out of the counts without a word. Many start times or fields were not tried in a browser.

Open from L-034: D-47 was taken as defaults (only a season-against-playoff clash refuses a publish; the playoff notice is queued at placement; playoff games are in the feed, not in the page's schedule list); confirmed by the owner (D-54). The refusal names the playoff slot, not the teams. Regenerating a bracket drops slots and sends no notice. The browser test checks that playoff notices are queued, not their text.

Open from L-037: D-48 was taken as defaults (points 0 to 9 with win ≥ tie ≥ loss; cap 1 to 99; forfeit score 0 to 99; a change after the first score needs a reason and re-ranks the whole season, with no "from this date"); confirmed by the owner (D-54). The public page does not state the points or the cap.

Open from L-038: D-49 was taken as defaults (settings, divisions, teams and weekly patterns are copied; blackouts, closed, hand-added and makeup slots are not; no field row is created); confirmed by the owner (D-54). A copy cannot leave a division or team out.

Open from L-033: D-51's defaults (a postponed game is not a team's next game; a playoff game in a closed slot is marked too; the feed says it in the title, with no `STATUS:CANCELLED`); confirmed by the owner (D-54). A displaced game the reschedule cannot place leaves the public page without a word once that version is published. The feed was not opened in a calendar app. `docs/DEMO.md` and the exec brief do not mention the postponed mark.

Open from L-042: D-50 was taken as a default (a rainout draft's stored report counts season games only; a regeneration's "before" cost includes placed playoff games); confirmed by the owner (D-54). `placeBracketGames` keeps its own list of fixed playoff games. Only the one-game-a-day clash was tried, with one bracket.

Open from the coverage pass (2026-10-13): the brief's screenshots are from 2026-10-12. `docs/DEMO.md` Part 3 was run as browser tests, not rehearsed aloud.
