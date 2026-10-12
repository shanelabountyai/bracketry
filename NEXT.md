# NEXT

PICK UP HERE: L-018, playoffs (**Opus** per the backlog). Read BRKT-01 to BRKT-05 in 00-master-prd.md, D-15, spec 02 (bracket sections) and the L-009 notes in PROGRESS. Generate a bracket for the top N with a frozen seeding snapshot, place playoff games into slots under the hard rules, enter results, feed forward, the correction rule, regenerate before the first result.

Done at L-017: rainout tool. `seasons/rainout-load.ts` (`loadRainout`: displaced games, the D-23 inventory, the reschedule and regenerate inputs), `seasons/rainout-actions.ts` (`closeDay`, `proposeReschedule`, `regenerateRest`), `seasons/save-draft.ts` (every draft version is written here), notices queued in `publish`. D-31 records the rules.

Needs the owner: D-27 and D-30: commissioners do setup and scores; the scorekeeper permission needs a template edit whenever you want it. D-31 was taken as defaults; say so if any part should change.

Open from L-009: no function clears a bracket result, and the spec's correction rule asks for one. That and the D-15 fingerprint check land at L-018.

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-021's seed data defines the same league, make one source for both.

Open from L-016: no editor for points, run-diff cap or forfeit settings (STAND-02); add one if a later item needs it.

Open from L-017: plain `generate` ignores played games (publish refuses the result if it moves a scored game). The Rainout section has not been opened in a browser; L-021's golden path 2 is its first e2e. Playoff slots (`BracketGame.fieldSlotId`) are not looked at by `closeDay`; L-018 decides what a closed playoff slot means.
