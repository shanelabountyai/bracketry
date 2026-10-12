# NEXT

PICK UP HERE: L-013, generation console (**Opus** per the backlog). Read GEN-01, GEN-03 to GEN-05, GEN-07 and SCHED-01 in 00-master-prd.md, D-17 (the caps), D-24 (slot id `day|start|fieldId`, the loader lands here), D-5 and D-9. Season setup now exists (L-012): load a season's divisions, teams, slots, blackouts and rules, build the engine's input, call the generator with a seed, store a draft `ScheduleVersion` with seed, input hash, fingerprint and report. Show feasibility live, hard/unplaced/soft before and after, iterations, every remaining violation, and "new seed". Versions and placements are never updated after creation.

Watch at L-013: run the setup actions through the harness again if you add any (`tests/fixtures/app.ts` seeds season, division, team, field, fieldSlot; add rows there for new `ref()` models). Check day/time formats in the action body after the scoped lookup, and `notFound()` for a foreign id. Do not run `prisma format` over `prisma/schema`.

Needs the owner: D-23 (the caller keeps past open slots out of the reschedule inventory) was taken as a default at L-010. Confirm or replace it before L-017. D-27 (setup = `org.update`) was a default at L-012; the scorekeeper permission is a template-owned edit, raised at L-015.

Open from L-008: standings notes carry team ids, not names (D-22). L-016 substitutes names.

Open from L-009: no function clears a bracket result, and the spec's correction rule asks for one. That and the D-15 fingerprint check land at L-018.

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-021's seed data defines the same league, make one source for both.
