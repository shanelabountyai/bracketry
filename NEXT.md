# NEXT

PICK UP HERE: L-011, data model and migrations (**Opus** per the backlog). Read 00-master-prd.md §8 and D-6, D-10, D-11, D-13. **Show the entity list and the exact SQL for the unique indexes, the partial unique index on the published version and the two append-only triggers first, and wait for the owner.** Then `prisma/schema/bracketry.prisma`, the migrations, and constraint tests that write conflicting rows straight to the database. The prompt is in docs/START-HERE.md ("From L-011 on").

Needs the owner: D-23 (the caller keeps past open slots out of the reschedule inventory) was taken as a default at L-010. Confirm or replace it before L-017.

Open from L-007: `reschedule` orders displaced games by old slot id, which is calendar order only while ids are `day|start|field`. Settle at L-011/L-017 (see PROGRESS L-007, Left behind).

Open from L-008: standings notes carry team ids, not names (D-22). L-016 (standings page) substitutes names; the capstone already does it with a regex.

Open from L-009: no function clears a bracket result, and the spec's correction rule asks for one; `Bracket` holds no standings fingerprint (D-15). Both land at L-018 (see PROGRESS L-009, Left behind).

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-011's seed data defines the same league, make one source for both.
