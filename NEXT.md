# NEXT

PICK UP HERE: L-022, closure (**Sonnet** per the backlog): finish `WRITEUP.md`, the executive write-up (`exec-brief` skill), deploy or decide not to (the port table says "Not deployed (sample project)"), build-log links. The global definition of done applies: `docs/DEMO.md` exists (L-021); still owed are the exec brief, the LinkedIn drafts in the Ledger, and the cost review. Record every artifact URL in the repo.

Done at L-021: `scripts/seed-bracketry.ts` (`npm run seed:bracketry`), `docs/DEMO.md`, `e2e/golden-path.spec.ts`. D-35 records the rules.

Needs the owner: D-27 and D-30: commissioners do setup and scores; the scorekeeper permission needs a template edit whenever you want it. D-31 to D-35 were taken as defaults; say so if any part should change. D-33's main call: a season is public as soon as a version is published, with no opt-out, at `/l/<org>/<season id>`. `next dev` appends an agent-rules block to `CLAUDE.md` on every start; it has been reverted each time. Say if you would rather commit it.

Open from L-016: no editor for points, run-diff cap or forfeit settings (STAND-02).

Open from L-017: plain `generate` ignores played games (publish refuses the result if it moves a scored game).

Open from L-018: `publish` does not look at playoff games, so a draft made before a playoff game was placed can be published onto its slot. No notice goes out for a playoff slot. When a new action file adds a `ref('<model>')`, add the fixture row to `tests/fixtures/app.ts` first.

Open from L-019: public reads share the template's 60-per-15-minutes per-IP limit; a league-sized limit is a template edit.

Open from L-021: the seed was only tried on a Monday; on a weekday where no trio can be left level it stops with a message (change `SEED`). The demo order with the rainout before the playoffs has not been driven in a browser. A playoff game cannot be scored live; the spec moves the slot's date in the test database.
