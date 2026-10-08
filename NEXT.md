# NEXT

PICK UP HERE: L-009 (`seedOrder`, `buildBracket`, `recordResult`, `champion`; **Sonnet** per the backlog). Read spec 02 §5 to §7 in full, and D-15. Rename tests/unit/league-bracket.pending.ts to .test.ts: 17 tests, 13 fail with NotImplementedError and 4 fail on their assertion today (see PROGRESS L-002), so check those 4 are red for the right reason before writing code. Seeding is a frozen snapshot: a late correction warns and never reseeds silently. `seedOrder` takes `StandingsRow[]` from L-008; decide what a shared rank (`needsManualResolution`) means for seeding from the spec, not by guessing. Every expected value is worked by hand in the spec: if one looks wrong, stop and show the arithmetic, do not edit it.

Open from L-007: `reschedule` orders displaced games by old slot id, which is calendar order only while ids are `day|start|field`. Settle at L-011/L-017 (see PROGRESS L-007, Left behind).

Open from L-008: standings notes carry team ids, not names (D-22). L-016 (standings page) substitutes names.
