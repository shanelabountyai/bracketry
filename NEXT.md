# NEXT

PICK UP HERE: L-008 (`computeStandings`, **Opus**: correctness-critical, D-13, D-14). Read spec 02 §1 to §4 in full, and D-13, D-14. Rename tests/unit/league-standings.pending.ts to .test.ts and confirm its 13 tests fail with NotImplementedError. Tally, run-diff cap, forfeits, the chain with scopes, the balanced check, restart and continue, shared ranks, manual resolutions, reasons: fixtures ST-1 to ST-9. Every expected value is worked by hand in the spec: if one looks wrong, stop and show the arithmetic, do not edit it. Never break a tie at random; an unbreakable tie is a shared rank. The chain is a short ordered list, not a rules engine. Restate the counting to the owner before writing code, as at L-005.

Open from L-007: `reschedule` orders displaced games by old slot id, which is calendar order only while ids are `day|start|field`. Settle at L-011/L-017 (see PROGRESS L-007, Left behind).
