# NEXT

The P0 backlog is done and the project was closed at L-022 (2026-10-12), then reopened by the owner for P1; L-023 to L-026 are done, and L-027 to L-030 from the P2 persona review. Closure artifacts are in `docs/RELEASE_NOTES.md`. Not deployed (D-36); nothing bills except CI minutes (D-37).

PICK UP HERE: L-034, publish looks at playoff games; playoff games in the calendar feed, with a notice (M; Opus): the row numbered 35 in the P2 section of `docs/prds/06-backlog.md`. It needs no decision; write its acceptance criteria into `00-master-prd.md` first, as L-027 to L-035 did. L-027 to L-032 and L-035 are done (SCORE-04 to SCORE-15, GEN-08, SEASON-07, SEASON-08, PUB-04 to PUB-11, D-44 to D-46). L-033, L-036 and L-039 each need a decision from the owner before code; L-037 (Opus) and L-038 (Sonnet) need none; L-040 and L-041 are blocked outside this repo.

Needs the owner: the exec brief is private until shared, and its footer links the build log, which a reader can only open once that page is shared too. The three LinkedIn drafts (Ledger 114, 115 and 116) were drafted without a review pass by the owner. The Ledger's project list has no `bracketry` entry. D-27 and D-30: commissioners do setup and scores; the scorekeeper permission needs a template edit. D-31 to D-35 were taken as defaults; say so if any part should change. D-33's main call: a season is public as soon as a version is published, with no opt-out. `next dev` appends an agent-rules block to `CLAUDE.md` on every start; it has been reverted each time.

Open from L-016: no editor for points, run-diff cap or forfeit settings (STAND-02).

Open from L-018: `publish` does not look at playoff games, so a draft made before a playoff game was placed can be published onto its slot. No notice goes out for a playoff slot. When a new action file adds a `ref('<model>')`, add the fixture row to `tests/fixtures/app.ts` first.

Open from L-019: public reads share the template's 60-per-15-minutes per-IP limit; a league-sized limit is a template edit.

Open from L-021: the seed was only tried on a Monday; on a weekday where no trio can be left level it stops with a message (change `SEED`). The demo order with the rainout before the playoffs has not been driven in a browser. A playoff game cannot be scored live; the spec moves the slot's date in the test database.

Open from L-023: clinch flags are on points only and never count a tiebreaker (D-38). The enumeration is uncached, about 0.4 s per division at 12 open games. `docs/DEMO.md` and the exec brief do not mention what-if.

Open from L-024: the feed was not opened in a calendar app (TZID with no VTIMEZONE block, D-39). Playoff games are not in it. One full `npm test` timed out in the template's INV-01..04 sweep and passed on the rerun; cause not established.

Open from L-026: D-41 was taken as defaults (one season-wide `crossoverRounds`, every two divisions, no chosen crossover week); say so if any part should change. No browser step sets crossover rounds. The demo seed, `docs/DEMO.md` and the exec brief have no crossover games. Lowering the setting after a generation leaves the dropped pairings in the what-if form.

Open from L-025: one season, nine calls, one prompt (D-43); nothing was measured on an impossible season, pins or a larger league. Opus matched the counted floor of 100 twice where the demo seed gives 122; seeds 1 to 20 give 100 to 124, so the demo's seed 2027 is one of the generator's worse ones and was left alone. `docs/DEMO.md`, the exec brief (version 2) and Ledger draft 116 now carry the result. The generator timed 6.1 s in the dry run and 0.64 s in the real one; not looked into.

Open from L-027: D-44 was taken as defaults (the server, not the browser, refuses an empty run box; a season correction's boxes are empty, a playoff correction's are prefilled); say so if any part should change. No browser test drives the season score form. The versions table still shows UTC.

Open from L-028: no browser test asserts the results order, the field headings, the unscored count or the missing form on a future game; the markup was not looked at in a browser.

Open from L-029: no browser test asserts the missing Generate buttons or the sentence that replaces them; the markup was not looked at in a browser.

Open from L-030: no browser test opens the team edit form or asserts the missing-email flag; the markup was not looked at in a browser. A rename is not audited and sends no notice; notices already in the outbox keep the old name and address. A team cannot be deleted or moved to another division.

Open from L-031: D-45's defaults (the confirm line is checked by the browser only; plain Generate stays refused after a void; playoff scores are not voidable); say so if any part should change. No browser test ticks the confirm line or voids a score; the markup was not looked at in a browser. The confirm line names the game, not the runs typed. A void sends no notice.

Open from L-032: D-46 was taken as defaults (the playoff line is the bracket's size and absent before a bracket; "updated" is the publish time, not the last score); say so if any part should change. No browser test shows the playoff line, a round name or the changes list. The width check ran with two short team names. The page has no stylesheet. `docs/DEMO.md` and the exec brief do not mention the phone view.

Open from L-035: every public read scores the whole published version and reads every version's report; not timed, not cached. The table ignores `?team=`. A placement whose game is no longer a season pairing is left out of the counts without a word. Many start times or fields were not tried in a browser. `docs/DEMO.md` and the exec brief do not mention the table.
