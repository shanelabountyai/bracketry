# NEXT

PICK UP HERE: L-012, season setup (**Sonnet** per the backlog). Read SEASON-01 to SEASON-06 in 00-master-prd.md and D-16, plus D-24 to D-26 from L-011. Season, divisions, teams, fields, weekly slot patterns materialized to slots, close/add a slot, blackouts with bulk holiday entry, rules form with defaults. Every action goes through the foundation's authorization path, with the invariant harness rows added in `tests/fixtures/app.ts`. Write and map the unique violation (constraint names are in `tests/integration/league-constraints.test.ts`); never check-then-write.

Watch at L-012: the first full `npm test` after the L-011 migration took 369 s, the second 29 s, cause unknown (PROGRESS L-011, Left behind). Reset league rows by deleting the org, not by TRUNCATE. Do not run `prisma format` over `prisma/schema`: it realigns the template's `core.prisma`.

Needs the owner: D-23 (the caller keeps past open slots out of the reschedule inventory) was taken as a default at L-010. Confirm or replace it before L-017.

Open from L-008: standings notes carry team ids, not names (D-22). L-016 (standings page) substitutes names; the capstone already does it with a regex.

Open from L-009: no function clears a bracket result, and the spec's correction rule asks for one. Both that and the D-15 fingerprint check land at L-018 (`Bracket.standingsFingerprint` now exists).

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-021's seed data defines the same league, make one source for both.

Open from L-011: the engine's slot id is `day|start|fieldId` (D-24); the loader that builds it lands at L-013.
