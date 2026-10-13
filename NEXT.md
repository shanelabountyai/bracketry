# NEXT

The P0 backlog is done and the project was closed at L-022 (2026-10-12), then reopened by the owner for P1; L-023 to L-026 are done. Closure artifacts are in `docs/RELEASE_NOTES.md`. Not deployed (D-36); nothing bills except CI minutes (D-37).

PICK UP HERE: nothing is queued. The P1 backlog is done (L-023 to L-026). The next thing is the owner's call: close again, or pick from the open notes below.

Needs the owner: the exec brief is private until shared, and its footer links the build log, which a reader can only open once that page is shared too. The three LinkedIn drafts (Ledger 114, 115 and 116) were drafted without a review pass by the owner. The Ledger's project list has no `bracketry` entry. D-27 and D-30: commissioners do setup and scores; the scorekeeper permission needs a template edit. D-31 to D-35 were taken as defaults; say so if any part should change. D-33's main call: a season is public as soon as a version is published, with no opt-out. `next dev` appends an agent-rules block to `CLAUDE.md` on every start; it has been reverted each time.

Open from L-016: no editor for points, run-diff cap or forfeit settings (STAND-02).

Open from L-017: plain `generate` ignores played games (publish refuses the result if it moves a scored game).

Open from L-018: `publish` does not look at playoff games, so a draft made before a playoff game was placed can be published onto its slot. No notice goes out for a playoff slot. When a new action file adds a `ref('<model>')`, add the fixture row to `tests/fixtures/app.ts` first.

Open from L-019: public reads share the template's 60-per-15-minutes per-IP limit; a league-sized limit is a template edit.

Open from L-021: the seed was only tried on a Monday; on a weekday where no trio can be left level it stops with a message (change `SEED`). The demo order with the rainout before the playoffs has not been driven in a browser. A playoff game cannot be scored live; the spec moves the slot's date in the test database.

Open from L-023: clinch flags are on points only and never count a tiebreaker (D-38). The enumeration is uncached, about 0.4 s per division at 12 open games. `docs/DEMO.md` and the exec brief do not mention what-if.

Open from L-024: the feed was not opened in a calendar app (TZID with no VTIMEZONE block, D-39). Playoff games are not in it. One full `npm test` timed out in the template's INV-01..04 sweep and passed on the rerun; cause not established.

Open from L-026: D-41 was taken as defaults (one season-wide `crossoverRounds`, every two divisions, no chosen crossover week); say so if any part should change. No browser step sets crossover rounds. The demo seed, `docs/DEMO.md` and the exec brief have no crossover games. Lowering the setting after a generation leaves the dropped pairings in the what-if form.

Open from L-025: one season, nine calls, one prompt (D-43); nothing was measured on an impossible season, pins or a larger league. Opus matched the counted floor of 100 twice where the demo seed gives 122; seeds 1 to 20 give 100 to 124, so the demo's seed 2027 is one of the generator's worse ones and was left alone. `docs/DEMO.md`, the exec brief (version 2) and Ledger draft 116 now carry the result. The generator timed 6.1 s in the dry run and 0.64 s in the real one; not looked into.
