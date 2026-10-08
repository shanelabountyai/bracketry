# NEXT

PICK UP HERE: L-010, the engine capstone (**Sonnet** per the backlog). Read PRD §9 and the Session 10 prompt in docs/START-HERE.md. One command, `npm run league -- capstone --seed 2027`, no database: feasibility, generate with before and after scores and the floor, seeded results with a forced three-way tie, standings with reasons, a bracket for the top 6 played to a champion, then a one-day rainout showing what moved. One integration test asserts a second run is identical. Every engine function it needs is built (L-003 to L-009); this item only wires them, so add no rule to the CLI (D-4).

For the bracket step: `buildBracket` takes team ids in seed order, so take the top 6 from `computeStandings` and refuse if any of them has `needsManualResolution` (BRKT-01). The capstone's forced three-way tie must therefore be one the chain or a recorded resolution actually breaks before seeding.

Open from L-007: `reschedule` orders displaced games by old slot id, which is calendar order only while ids are `day|start|field`. Settle at L-011/L-017 (see PROGRESS L-007, Left behind).

Open from L-008: standings notes carry team ids, not names (D-22). L-016 (standings page) substitutes names.

Open from L-009: no function clears a bracket result, and the spec's correction rule asks for one; `Bracket` holds no standings fingerprint (D-15). Both land at L-018 (see PROGRESS L-009, Left behind).
