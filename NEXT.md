# NEXT

PICK UP HERE: L-015, score entry (**Sonnet** per the backlog). Read SCORE-01 to SCORE-03 in 00-master-prd.md and D-13 (GameResult is append-only by trigger; a correction is a new row with `supersedesId`; one original per game by partial unique index). Runs or forfeit, today-or-earlier rule on the injected clock (`now()` from `@/core/clock`, the season's timezone for "today"), corrections with a reason, result history.

Watch at L-015: the scorekeeper permission is a template-owned edit (D-27 note): stop and say so rather than editing `src/core`. New actions need `ref('game')`-style fixtures already in `tests/fixtures/app.ts` (a game and a draft version exist for both fixture orgs; add a `gameResult` row there if an action takes `ref('gameResult')`). Map the unique violations, never check-then-write.

Needs the owner: D-23 (the caller keeps past open slots out of the reschedule inventory) was a default at L-010. Confirm or replace it before L-017. D-27 (setup = `org.update`) was a default at L-012; the scorekeeper permission is raised at L-015.

Open from L-008: standings notes carry team ids, not names (D-22). L-016 substitutes names.

Open from L-009: no function clears a bracket result, and the spec's correction rule asks for one. That and the D-15 fingerprint check land at L-018.

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-021's seed data defines the same league, make one source for both.

Open from L-014: a pin whose slot is closed later is not dropped; it shows as a hard violation at the next generation (L-017's rainout tool should offer to remove such pins).
