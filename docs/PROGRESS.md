# Progress

## L-009: brackets (2026-10-08)

**Built.** `seedOrder`, `buildBracket`, `recordResult` and `champion` in `src/lib/league/bracket.ts` (spec 02 §5 to §7), about 85 lines. `seedOrder` is the spec's recurrence as a loop: start from `[1, 2]` and replace each seed `s` with `s, n + 1 − s` while doubling `n`. `buildBracket` sizes to the smallest power of two, turns seed numbers above the team count into byes, and builds each later round from the one before, so a bye match sets its winner at build time and that team is already in its round-2 slot. `recordResult` clones the bracket, refuses an unknown match, a match whose two slots are not both teams (a bye, or waiting on an earlier game), and equal runs without a forfeit, then writes the winner into its next slot with its original seed. A correction is the same call again and is refused once the next match has a result (BRKT-05). `champion` is the final's winner or null. Suite renamed `.pending.ts` to `.test.ts`; it was the last pending suite.

**Decided.** Nothing that needs a decision row. Two readings worth recording. First, NEXT.md for this item said `seedOrder` takes `StandingsRow[]`: it does not. The type contract is `seedOrder(size: number)` and `buildBracket(teams: TeamId[])`, so a shared rank never reaches the engine. BRKT-01 already settles it: the bracket is blocked while any included team needs a commissioner decision, and that check belongs to the caller (L-010 for the capstone, L-018 for the app). Second, the forfeit rule is read before the runs, so `{ aRuns: 0, bRuns: 0, forfeit: 'a' }` is not a tie.

**Measured.** Red first: 17 tests, 13 NotImplementedError and 4 on `expected false to be true`. Those 4 are the tests that only assert a refusal (bad size, tie, unknown or waiting match, bye match), and `refuses()` returns false for a stub by design, so they were red for the right reason. Green: 17/17 with no expected value changed and no test added. Gate: lint 0 errors (1 warning, in the template's `e2e/billing.spec.ts`; the 6 that went were the stub's unused parameters), typecheck clean, 306 tests across 36 files, `foundation:drift` clean against v1.2.0. `pending:check`: no pending suites left.

**Left behind.** The spec says a refused correction needs "the later result cleared first", and there is no function that clears a result: L-018 has to add one or raise it. Runs are not validated here (negative or fractional runs are accepted); that is the score-entry boundary's job. `Bracket` carries no standings fingerprint, so the frozen snapshot of D-15 is something L-018 stores beside it. `pending:check` crashed with no pending suites (it read a report Vitest never wrote); it now says so and exits 0, and can be deleted along with `vitest.pending.config.ts` whenever convenient.

## L-008: computeStandings (2026-10-08)

**Built.** `computeStandings` in `src/lib/league/standings.ts` (spec 02 §1 to §4). One `tally` function builds the table: played, W/L/T, points, raw runs for and against, and the margin clamped to ±`runDiffCap`. A forfeit is a win and a loss whatever the forfeit score, and enters the runs only when `forfeitCountsInRuns` is set. `tally` drops any result naming a team outside its list, so calling it with a tied group is the 'tied' scope: there is no second counting path. `resolve(group, step)` follows the spec's pseudocode line for line: skip a tied-scope step until the group is balanced, split by value best first, restart or continue for a part still tied, then a manual resolution or a shared rank. Suite renamed `.pending.ts` to `.test.ts`. The counting was restated to the owner and confirmed before any code was written.

**Decided.** D-22, where the spec is silent. Two manual resolutions for the same teams: the last one wins. Team id order is code-unit order (`sort()`), not `localeCompare`, so it cannot change with the locale. A forfeit counts as a meeting for the balanced check. Notes: "1st via head-to-head over B", "2nd via head-to-head behind A", "3rd via overall runs allowed over B", "4th on points", "1st by commissioner decision over A", "1st, tied with C: no tiebreak step separates them". Nothing is drawn at random: there is no PRNG import in the file.

**Measured.** Red first: 13 tests, 13 NotImplementedError. Green: 16/16 (13 from the suite with no expected value changed, plus 3 added for the choices above, each worked from ST-4). Gate: lint 0 errors (7 warnings, down from 10: the stub's unused parameters are gone), typecheck clean, 289 tests across 35 files, `foundation:drift` clean against v1.2.0. `pending:check`: 17 tests in one suite, 13 NotImplementedError.

**Left behind.** Notes carry team ids; L-016 (standings page) must substitute names. The caller passes current results only: `GameResult` has no id or `supersedesId`, so dropping superseded rows is the loader's job (D-13). A result where home and away are the same team is not rejected here. Each tied-scope step re-tallies the results for its group, which is nothing at league size (tens of games).

## L-007: reschedule (2026-10-08)

**Built.** `reschedule` in `src/lib/league/schedule.ts` (spec §7). A game is displaced when its slot is in `removedSlotIds` or is no longer in the inventory. The displaced games are lifted out, and each in turn is tried in every free slot: it takes the one that adds no hard violation and gives the lowest soft cost, the earliest in (day, start, field) order on a tie, and is unplaced when there is none (D-9). Legality and cost are both `scoreSchedule` on the candidate assignment (D-4); the "adds no hard violation" baseline is the same one `greedyDraft` uses, and `bySlot` is reused. No other game is touched (D-12). Suite renamed `.pending.ts` to `.test.ts`.

**Decided.** Where spec §7 is silent. `seed` is not read: the spec describes no random choice, so the result is a function of the other inputs, and a test asserts that two seeds give the same result. The removed slots are not in the request (only their ids are), so "order of old slot" is the order of the old slot ids, then game key; that is (day, start, field) order while ids are `day|start|field`, as in the fixtures. The pass is greedy, one game at a time against the games already settled: it does not search for the best joint placement of all displaced games (D-5). A displaced pinned game comes back unplaced, because any other slot is `PIN_MOVED` and its own slot is gone (D-21). Result `unplaced` lists displaced games only, in the order tried; `report.unplaced` lists every unplaced game. A game that was already unplaced stays unplaced, and a non-displaced game with a hard violation of its own (a blackout added later) stays put and stays reported: both are "regenerate the rest", a different action (RAIN-05).

**Measured.** Red first: 2 tests, 2 NotImplementedError. Green: 3/3 (2 from the suite, plus one added and worked by hand: Wed costs REST 10, Fri costs 0 on both fields, the game goes to Fri F1). Capstone at seed 2027, Thu Apr 22 rained out: 1 game displaced (`L1:T07~T09`; the generator had left that day nearly empty). The schedule scored 114; the 35 games that stay score 105 on their own.

| Inventory after | Free slots | Moved to | Unplaced | Hard | Soft after | Wall time |
|---|---|---|---|---|---|---|
| 4 Saturday makeup slots (May 29) | 21 | `2027-05-29|09:00|F1` | 0 | 0 | 107 | 3 ms |
| no makeup slots | 17 | `2027-05-20|19:30|F1` | 0 | 0 | 114 | 2 ms |

Gate: lint 0 errors (10 warnings), typecheck clean, 273 tests across 34 files, `foundation:drift` clean against v1.2.0. `pending:check`: 30 tests in two suites, 26 NotImplementedError.

**Left behind.** If the app's slot ids are database ids rather than `day|start|field`, "order of old slot" becomes id order, which is deterministic but not calendar order. L-011 or L-017 should either build engine slot ids from (day, start, field) at the boundary or raise a change to `RescheduleRequest` to carry the removed slots. One full `scoreSchedule` call per (displaced game, free slot): 3 ms here, and a whole rained-out day of 4 games against 20 free slots is about 80 calls. Entries in `current` for games not in `input.games` are carried through untouched.

## L-006: repair loop (2026-10-08)

**Built.** `greedyDraft`, `repair` and `generateSchedule` in `src/lib/league/schedule.ts` (spec §5). The draft places pins, then each game in (round, key) order into the first free slot in (day, start, field) order that adds no hard violation. Repair is a local search over the three spec moves (MOVE to a free slot, SWAP two games, PLACE an unplaced game with the occupant sent to a free slot or to unplaced), one candidate per iteration, each scored by a full `scoreSchedule` call and kept only when strictly better on (hard, unplaced, soft). Legality in the draft and every cost in the loop come from `scoreSchedule` (D-4). Suite renamed `.pending.ts` to `.test.ts`. The move set and the ordering rules were shown to the owner and approved before the loop was written.

**Decided.** Search order, chosen by the owner: violation-guided 80/20. The focus game is one the current report blames 80% of the time (hard violations first, then soft; an equity violation names no games, so it blames every game of its teams) and any movable game 20%; then an even choice between MOVE and SWAP. The 80/20 split and the even choice are untuned. One change from what was shown: when games are unplaced, PLACE takes half the iterations rather than all of them, so a season that cannot be completed still has its soft cost worked on. Determinism (D-3): one `mulberry32(seed)` per call is the only source of choice; every pool it indexes is an array sorted first (games by key, slots by day, start, field); Sets are membership only; stop conditions are counts, no clock. A pinned game is never a candidate and a pinned slot never a target. The two `reschedule` tests moved unchanged into `tests/unit/league-reschedule.pending.ts` so this suite can be green while `reschedule` is a stub.

**Measured.** Red first: 15 tests, 15 NotImplementedError. Green: 14/14 (13 from the suite, plus one added: reversing the input arrays gives the same fingerprint). Capstone, default bounds, floor 100 (spec §6.4), wall time on the laptop inside Vitest:

| Seed | Soft before | Soft after | Iterations | Accepted | Wall time |
|---|---|---|---|---|---|
| 2027 | 320 | 114 (REST 110, SLOT_EQUITY 4) | 2,508 | 22 | 281 ms |
| 1 | 320 | 110 | 3,355 | 26 | 336 ms |
| 2 | 320 | 102 | 3,093 | 29 | 430 ms |
| 3 | 320 | 120 | 2,741 | 22 | 268 ms |

Every run stopped on patience (1,500 iterations with no accepted move), not on `maxIterations`. None reached the floor of 100; seed 2 came closest, with REST at the floor and 2 of field equity on top. 12 teams over 10 weeks at seed 1: 382 to 138 in 3,252 iterations, 622 ms. The impossible season (9 teams, 4 weeks, seed 1): 4 unplaced before and after, 0 hard, soft 308 to 280. Gate: lint 0 errors (11 warnings), typecheck clean, 270 tests across 33 files, `foundation:drift` clean against v1.2.0. `pending:check`: 32 tests in three suites, 28 NotImplementedError.

**Left behind.** `repair` does not move a pinned game that arrives off its pin or unplaced: it stays reported (`PIN_MOVED`, or unplaced per D-21) and the loop works around it. Refusing an illegal pin is L-014. No incremental scorer (spec §8 does not require one); marked with a `ponytail:` comment naming the 5 s trigger from D-17. The D-17 cap on `maxIterations` is enforced by the caller (L-013), not here. No `league generate` CLI command: the capstone script is L-010.

## L-005: scoreSchedule (2026-10-08)

**Built.** `scoreSchedule` in `src/lib/league/schedule.ts`: the six hard codes and five soft codes of spec §4, each violation with a full-sentence `detail`. Suite renamed `.pending.ts` to `.test.ts`. The counting was restated to the owner and confirmed before any code was written.

**Decided.** D-21: an unplaced pinned game is unplaced only, not `PIN_MOVED`. Where spec §4 is silent: a division's teams are every team in any of its input games, placed or not (a team with nothing placed counts 0); a weight of 0 emits no violation rather than a cost-0 one; one `Violation` per group (slot, team-time, team-day, division-start or division-field) with `cost` = its units; hard violations come out in the §4.1 table order then by sorted key, and a (day, start) tie in a team's game order breaks by game key (D-3); assignment and pin keys not in `input.games` are ignored; duplicate blackout rows count once.

**Measured.** Red first: 11 tests, 11 NotImplementedError. Green: 11/11. The §4.3 bad schedule scores 6 hard (1 `SLOT_DOUBLE_BOOKED`, 2 `TEAM_SAME_TIME`, 2 `TEAM_DAY_LIMIT`, 1 `BLACKOUT`) and 31 soft (`REST` 30, `FIELD_EQUITY` 1), unplaced `['L1:B~C']`, matching the hand count line by line with no fixture value touched. Gate: lint 0 errors (16 warnings, unused params in the remaining stubs), typecheck clean, 256 tests across 32 files, `foundation:drift` clean against v1.2.0.

**Left behind.** No `league score` CLI command: the backlog row does not ask for one. Spec §4.2's sample sentence says "minimum 3" while the default `minRestDays` is 2; read as illustrative wording, not changed.

## L-004: feasibility (2026-10-07)

**Built.** `checkFeasibility` in `src/lib/league/feasibility.ts`: the three necessary conditions of spec §3 in spec order (teams in id order), each shortfall with a full-sentence `detail` carrying its numbers. `npm run league -- feasibility <file.json>` reads a `ScheduleInput` and prints the report. Suite renamed `.pending.ts` to `.test.ts`.

**Decided.** The team set is derived from the games (a team with no games is not counted in daily capacity). The pass message says "could fit" and that the generator may still leave games unplaced (D-8).

**Measured.** Red first: 5 tests, 5 NotImplementedError. Green: 5/5. Gate: lint 0 errors, typecheck clean, 245 tests across 31 files, `foundation:drift` clean. Report for 9 teams over 4 weeks: 36 games, 32 slots, `SLOTS_SHORT` by 4 and `DAILY_CAPACITY_SHORT` by 4.

**Left behind.** Nothing.

## L-003: round robin (2026-10-07)

**Built.** `gameKey` and `roundRobin` (circle method, last seat fixed, odd counts get a bye seat) in `src/lib/league/round-robin.ts`; `npm run league -- pairings --teams N [--legs 2]` prints rounds and byes. Suite renamed `.pending.ts` to `.test.ts`.

**Decided.** Spec §2 does not say which seat is fixed or which way the rest rotate; fixed = last seat, rotation by +1 per round. The suite and the spec's properties do not depend on it. Leg 2 is built by mirroring leg 1's home/away, round offset `m − 1`.

**Measured.** Red first: 77 tests, 77 NotImplementedError. Green: 77/77. Gate: lint 0 errors (19 warnings, all unused params in the remaining stubs), typecheck clean, 240 tests across 30 files, `foundation:drift` clean against v1.2.0. `pending:check` now covers 61 tests in five suites.

**Left behind.** Nothing.

## L-002: guard rails (2026-10-06)

**Built.** ESLint block scoped to `src/lib/league/**` banning `Math.random`, `Date.now`, argument-less `new Date()`, and imports from `@/core`, `@/app`, `@/modules` and Prisma (D-3). `scripts/league.ts` CLI skeleton (`npm run league -- <command>`, no commands yet). `npm run pending:check` runs the pending suites through `vitest.pending.config.ts` and prints, per suite, NotImplementedError vs other failures.

**Decided.** `new Date('2026-01-01')` is not banned by the rule (only the clock-reading no-arg form); D-6 still forbids it by convention. Pending suites run with no setup file, so they need no database.

**Measured.** `pending:check`: 138 tests, 133 NotImplementedError, 5 other failures (the "refusal" tests, which fail on their assertion). Per suite: bracket 17 (13/4), feasibility 5 (5/0), generate 15 (15/0), round-robin 77 (76/1), score 11 (11/0), standings 13 (13/0). Lint rule verified against a probe file: all five banned forms flagged, `new Date('...')` correctly not.

**Left behind.** Nothing. The CLI has no commands until L-003.
