# NEXT

PICK UP HERE: L-019, public league pages (**Opus** per the backlog). Read PUB-01 to PUB-03 in 00-master-prd.md, and the template's spec §7c and §8 before adding a public route. Schedule by day and by team, standings, bracket; published version only; "moved from" mark for 7 days; a projection function that returns public fields only, with a test that fails if a contact field appears.

Done at L-018: playoffs. `seasons/bracket-load.ts` (`loadBrackets`: standings plus each division's bracket replayed from its rows, `stale`, `reseeds`, `started`), `seasons/bracket-actions.ts` (`generateBracket`, `placeBracketGames`, `recordBracketResult`, `clearBracketResult`), `seasons/[season]/bracket/page.tsx`, `clearResult` in the engine. D-32 records the rules. L-019's public bracket can read `loadBrackets` and project it.

Needs the owner: D-27 and D-30: commissioners do setup and scores; the scorekeeper permission needs a template edit whenever you want it. D-31 and D-32 were taken as defaults; say so if any part should change.

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-021's seed data defines the same league, make one source for both.

Open from L-016: no editor for points, run-diff cap or forfeit settings (STAND-02); add one if a later item needs it.

Open from L-017: plain `generate` ignores played games (publish refuses the result if it moves a scored game). The Rainout section has not been opened in a browser; L-021's golden path 2 is its first e2e.

Open from L-018: `publish` does not look at playoff games, so a draft made before a playoff game was placed can be published onto its slot. No notice goes out for a playoff slot. The Playoffs page has not been opened in a browser. When a new action file adds a `ref('<model>')`, add the fixture row to `tests/fixtures/app.ts` first: without it the invariant sweep timed out instead of naming the missing row.
