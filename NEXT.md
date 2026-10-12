# NEXT

PICK UP HERE: L-020, schedule quality table per version, with the floor where it can be counted (**Sonnet** per the backlog). Read QUAL-01 and QUAL-02 in 00-master-prd.md. The numbers come from each version's stored `report` and from `scoreSchedule` (D-4); say what was measured, never "optimal" (D-5).

Done at L-019: public league pages. `src/app/l/public-league.ts` (`loadPublicLeague` and the `toPublic*` projections), `src/app/l/[org]/[season]/page.tsx`, `tests/integration/public-league.test.ts`, `e2e/public-league.spec.ts`. D-33 records the rules. `loadStandings` and `loadBrackets` take `{ orgId }` now.

Needs the owner: D-27 and D-30: commissioners do setup and scores; the scorekeeper permission needs a template edit whenever you want it. D-31, D-32 and D-33 were taken as defaults; say so if any part should change. D-33's main call: a season is public as soon as a version is published, with no opt-out, at `/l/<org>/<season id>`.

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-021's seed data defines the same league, make one source for both.

Open from L-016: no editor for points, run-diff cap or forfeit settings (STAND-02); add one if a later item needs it.

Open from L-017: plain `generate` ignores played games (publish refuses the result if it moves a scored game). The Rainout section has not been opened in a browser; L-021's golden path 2 is its first e2e.

Open from L-018: `publish` does not look at playoff games, so a draft made before a playoff game was placed can be published onto its slot. No notice goes out for a playoff slot. The Playoffs page has not been opened in a browser. When a new action file adds a `ref('<model>')`, add the fixture row to `tests/fixtures/app.ts` first: without it the invariant sweep timed out instead of naming the missing row.

Open from L-019: public reads share the template's 60-per-15-minutes per-IP limit; a league-sized limit is a template edit. L-021's e2e seeds through SQL the way `e2e/public-league.spec.ts` does, or through `seed:bracketry`.
