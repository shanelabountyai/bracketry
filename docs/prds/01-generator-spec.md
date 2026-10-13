# 01 — Generator spec (normative)

Covers `src/lib/league/{round-robin,feasibility,schedule}.ts`. Types and defaults are in `types.ts`; this file gives the rules and the worked numbers. Each fixture below is in a pending suite under `tests/unit/`, and each expected value was checked two ways: by hand (shown here) and by running the suites against a throwaway reference implementation, which is not in this repo.

## 0. Ground rules

- **Pure.** No database, no clock, no `Math.random`, no process timezone. Randomness comes from `mulberry32(seed)` in `prng.ts`.
- **Calendar days are strings.** `'2027-04-06'`. Day arithmetic goes through `days.ts`. No `new Date(string)`.
- **Slots are uniform.** Every slot in a season is the same length and start times sit on a shared grid, so two slots overlap only when they share a day and a start (D-7).
- **Inputs are never mutated.** Every function returns new objects.

## 1. Vocabulary

| Term | Meaning |
|---|---|
| Pairing | Two teams, a round and a leg. Not yet on the calendar. |
| Game | A pairing in the scheduling input, with an optional division. |
| Slot | One (day, start, field). |
| Assignment | Map from game key to slot id. A game with no entry is unplaced. |
| Hard violation | Makes a schedule unpublishable. |
| Soft violation | Costs units × weight. A schedule with soft violations can be published. |

## 2. Round robin (`roundRobin`, L-003)

**Method.** The circle method. With `n` teams, let `m = n` if even, `n + 1` if odd (the extra seat is the bye). Fix one seat and rotate the other `m − 1`; round `r` pairs the fixed seat with rotating position 0, and position `k` with position `m − 1 − k` for `k = 1 … m/2 − 1`.

**Home and away.** Index the teams `0 … n − 1` in input order. For a pair with indices `i < j`, the home team is `i` when `i + j` is odd, otherwise `j`. Leg 2 swaps home and away. This gives every team a home/away difference of at most 1 in a single round robin and exactly 0 in a double. Worked for `n = 6`, team index 2: opponents 0 (sum 2, even → 2 is home), 1 (sum 3, odd → 1 is home), 3 (sum 5 → 2 is home), 4 (sum 6 → 4 is home), 5 (sum 7 → 2 is home): 3 home, 2 away.

**Keys.** `gameKey(leg, x, y)` = `L${leg}:${a}~${b}` with `a < b` by string comparison. The key identifies the game for its whole life, across schedule versions.

**Rounds.** Numbered from 1. Leg 2 continues after leg 1: round `r` of leg 2 is `r + (m − 1)`.

**Properties asserted for every `n` from 2 to 16** (`league-round-robin.pending.ts`):

| Property | Single | Double |
|---|---|---|
| Rounds | `m − 1` | `2(m − 1)` |
| Games | `n(n − 1)/2`, each pair once | `n(n − 1)`, each pair twice with home and away swapped |
| A team per round | at most once | at most once |
| Byes when `n` is odd | one team per round, each team once | one per round, each team twice |
| Home − away per team | at most 1 in absolute value | exactly 0 |

**Refusals.** Fewer than 2 teams; duplicate team ids.

**Determinism.** The output depends only on the order of `teams`. To vary a season, the caller shuffles the teams with `shuffle(teams, mulberry32(seed))` first.

## 3. Feasibility (`checkFeasibility`, L-004)

Three **necessary** conditions. Passing all three does not prove a schedule exists; the generator can still come back with unplaced games. The UI wording follows from that (D-8).

Let `max` = `rules.maxGamesPerTeamPerDay`, and for each day `d`: `slots_d` = slots that day, `starts_d` = distinct start times that day, `avail_d` = teams not blacked out that day.

| Code | Condition that must hold | `shortBy` |
|---|---|---|
| `SLOTS_SHORT` | games ≤ total slots | games − slots |
| `DAILY_CAPACITY_SHORT` | games ≤ Σ_d min(`slots_d`, floor(`avail_d` × min(`max`, `starts_d`) / 2)) | games − that sum |
| `TEAM_DAYS_SHORT` (per team) | team's games ≤ Σ over its open days of min(`max`, `starts_d`) | games − capacity |

Shortfalls are returned in that order, teams in id order. `perTeam` is in team id order. Each shortfall has a `detail` sentence with the numbers in it.

**Worked fixtures** (capstone calendar: Tuesdays and Thursdays from Tue 2027-04-06, starts 18:00 and 19:30, fields F1 and F2, so 4 slots a game day and 2 game days a week):

| Fixture | Games | Slots | Effective capacity | Result |
|---|---|---|---|---|
| 9 teams, 8 weeks | 9×8/2 = 36 | 16 days × 4 = 64 | 16 × min(4, floor(9/2)=4) = 64 | feasible; each team: 8 games, 16 open days |
| 9 teams, 4 weeks | 36 | 32 | 32 | `SLOTS_SHORT` 4, `DAILY_CAPACITY_SHORT` 4 |
| 7 teams, 3 weeks | 21 | 24 | 6 × min(4, floor(7/2)=3) = 18 | `DAILY_CAPACITY_SHORT` 3 only: enough slots, not enough calendar |
| 6 teams, 3 weeks, T01 out Apr 6 and Apr 8 | 15 | 24 | 4 days × 3 + 2 days × floor(5/2)=2 → 16 | `TEAM_DAYS_SHORT` T01 by 1 (needs 5, has 4 open days) |
| 7 teams, 3 weeks, `max` = 2 | 21 | 24 | 6 × min(4, floor(7×2/2)=7) = 24 | feasible |

## 4. Scoring (`scoreSchedule`, L-005)

One function. The repair loop, the publish gate, the quality report and the reschedule tool all call it (D-4). `report.unplaced` lists games with no entry in the assignment, sorted. `isPublishable` = no hard cost and nothing unplaced.

### 4.1 Hard violations (cost 1 each)

| Code | Counted as |
|---|---|
| `UNKNOWN_SLOT` | one per game whose slot id is not in the inventory. That game takes no further part in scoring and is not listed as unplaced. |
| `SLOT_DOUBLE_BOOKED` | for a slot holding `k` games, `k − 1` |
| `TEAM_SAME_TIME` | for a team with `k` games at one (day, start), `k − 1` |
| `TEAM_DAY_LIMIT` | for a team with `k` games on one day, `max(0, k − maxGamesPerTeamPerDay)` |
| `BLACKOUT` | one per (game, team) where the team is blacked out on the game's day |
| `PIN_MOVED` | one per pinned game that is not in its pinned slot |

A team in two games at the same time with a day limit of 1 scores both `TEAM_SAME_TIME` and `TEAM_DAY_LIMIT`. That is intended: they are different rules and both sentences are true.

### 4.2 Soft violations (cost = units × weight)

For each team, sort its placed games by (day, start). For each consecutive pair, `diff` = days between them.

| Code | Fires when | Units | Default weight |
|---|---|---|---|
| `REST` | `0 < diff < minRestDays` | 1 per pair | 10 |
| `LONG_GAP` | `diff > maxGapDays` | 1 per pair | 3 |
| `SLOT_EQUITY` | per division, per distinct start time in the inventory: `spread` = most games any team has at that start − fewest | `max(0, spread − 1)` | 2 |
| `FIELD_EQUITY` | same, per field | `max(0, spread − 1)` | 1 |
| `REMATCH` | both legs of a pairing placed fewer than `minRematchDays` apart | 1 per pairing | 5 |

Same-day games (`diff = 0`, only possible when doubleheaders are allowed) are not a `REST` violation. Equity is measured among the teams of one division; a game with no division belongs to one implicit division. A weight of 0 turns a rule off.

Every violation carries a `detail` sentence a coach could read: "T04 plays 2027-04-06 and 2027-04-08 (2 day rest, minimum 3)."

### 4.3 The deliberately bad schedule, worked

Teams A, B, C, D. Slots: Tue Apr 6, Wed Apr 7, Thu Apr 8, Tue Apr 27; starts 18:00 and 19:30; fields F1, F2. D is blacked out Apr 8. Default rules.

| Game | Slot |
|---|---|
| A~B | Apr 6, 18:00, F1 |
| C~D | Apr 6, 18:00, F1 |
| A~C | Apr 6, 18:00, F2 |
| B~D | Apr 7, 18:00, F1 |
| A~D | Apr 8, 18:00, F1 |
| B~C | not placed |

Hard: the Apr 6 18:00 F1 slot holds two games (1). A is in A~B and A~C at the same time (1) and has two games that day (1). C the same, in C~D and A~C (1 + 1). D plays on its blackout (1). **Total 6.**

Soft: B plays Apr 6 and Apr 7 (REST). D plays Apr 6, 7 and 8 (REST twice). A's games are Apr 6, Apr 6, Apr 8: differences 0 and 2, neither fires. REST = 3 × 10 = 30. At 18:00 the counts are A 3, B 2, C 2, D 3: spread 1, no cost. On F1 the counts are A 2, B 2, C 1, D 3: spread 2, one unit × 1 = 1. **Total 31.** Unplaced: `['L1:B~C']`.

## 5. Generation (`generateSchedule`, L-006)

Two phases. The return value reports both (`before` is the draft's score, `report` the final one).

**Phase 1, greedy draft.** Place pinned games in their slots. Take the remaining games in (round, key) order and the slots in (day, start, field) order. Give each game the first free slot that creates no hard violation. A game with no such slot stays unplaced. The draft therefore has zero hard violations by construction.

**Phase 2, repair.** A local search over single moves, driven by the seeded PRNG:

- move one game to a free slot;
- swap the slots of two games;
- place an unplaced game, displacing another to a free slot or to unplaced.

Pinned games never move. A candidate is **accepted only when it is strictly better** in this order: fewer hard violations, then fewer unplaced games, then lower soft cost. The loop stops at `maxIterations` (default 5000), after `patience` iterations with no accepted move (default 1500), or when all three are zero. `iterations` and `accepted` are returned.

The search order is free: choosing moves from the current violations rather than at random is allowed and encouraged. What is fixed is the acceptance rule, the bounds, the determinism, and that the result is scored by `scoreSchedule`.

**Guarantees** (`league-generate.test.ts`):

1. `report` equals `scoreSchedule(input, assignment)` exactly; `fingerprint` equals `fingerprint(assignment)`.
2. `report.hardCount` is 0 whenever generation starts from the greedy draft.
3. The final score is never worse than `before`.
4. Same input and seed → identical assignment, fingerprint and iteration count.
5. A pinned game is in its pinned slot.
6. An infeasible input returns unplaced games and `isPublishable = false`. It does not throw and does not place a game illegally (D-9).

`repair(input, start, opts)` runs phase 2 alone from any assignment, including one with hard violations (an import, a hand edit). On the §4.3 schedule with three weeks of Tue/Wed/Thu slots it must reach 0 hard, 0 unplaced, and a soft cost below 31.

## 6. What the heuristic may claim (D-5)

- It finds a legal schedule when its greedy draft does, and then lowers the soft cost. It does not prove the result is the best possible, and no screen or document says "optimal".
- Where a floor can be shown by counting, the floor is reported beside the result.

### 6.4 The capstone floor, worked

Capstone: 9 teams, single round robin (8 games each), 7 weeks of Tuesdays and Thursdays, `minRestDays = 3`, T03 blacked out Tue Apr 13 and Thu Apr 15, T07 blacked out Tue Apr 20.

With `minRestDays = 3`, a team that plays Tuesday and Thursday of one week has a `REST` violation (2 days). Thursday to the next Tuesday is 5 days and is fine. So a team's `REST` count is the number of weeks in which it plays twice.

A team with 8 games and `k` weeks available must play twice in at least `8 − k` weeks. Eight teams have 7 weeks: at least 1 each. T03 has lost a whole week and has 6: at least 2. T07 still has its Thursday that week, so 7 weeks: at least 1. **Floor: 8 + 2 = 10 violations × 10 = 100.**

The greedy draft scores 320 on this input. The throwaway reference implementation, which picks moves at random, finished at 104, 112, 100 and 100 for seeds 2027, 1, 2 and 3, in 2,759 to 4,582 iterations. The acceptance bound for this repo's implementation is **100 ≤ soft cost ≤ 130 at seed 2027 with default bounds**. Those reference numbers describe that one implementation; this repo's numbers go in `WRITEUP.md` when measured.

## 7. Reschedule (`reschedule`, L-007)

Input: the inventory after the change (closed slots removed, makeup slots added), the current assignment, the removed slot ids, a seed.

1. A game is **displaced** when its slot is in `removedSlotIds` or no longer in the inventory.
2. Every other game keeps its slot. This is the guarantee, and it is tested game by game (D-12).
3. Displaced games are taken in order of their old slot. Each goes to the legal free slot that gives the lowest soft cost, earliest slot on a tie.
4. A displaced game with no legal slot is returned in `unplaced`. `report.hardCount` stays 0.
5. `moved` lists each relocated game with `from` and `to`. `moved.length + unplaced.length` equals the number of displaced games.

The result becomes a new draft schedule version in the app. Reschedule never edits a published version.

## 8. Performance note

Measured once, on the throwaway reference with a full re-score per candidate, in a cloud container: 12 teams (66 games), 80 slots, 5000 iterations took about 1 s; the 9-team capstone about 0.4 s. That is the basis for running generation inside a server action with the caps in D-17. An incremental scorer would be faster and is not required.

## 9. Crossover games (L-026, D-41)

A season has `crossoverRounds` (0 to 16, default 0). For every two divisions, with each division's teams sorted by id, call the one with fewer teams S (size s) and the other B (size b); on equal sizes the division with the lower id is S.

1. Rounds run r = 0 … min(`crossoverRounds`, b) − 1. No round is added once every opponent has been met.
2. In round r, S[j] plays B[(j + offset) mod b] for every j, where `offset = r·s + floor(r / p)` and `p = b / gcd(s, b)`.
3. S[j] hosts when j + r is even; otherwise the B team hosts.
4. The game's key is `X:${a}~${b}` with a < b by string compare, `leg` 1. `division` is the home team's division and `awayDivision` the away team's.
5. `round` is `max(1, round((r + 1) · last / (crossoverRounds + 1)))`, where `last` is the highest division round. The draft fills slots in round order, so this spreads crossover rounds through the season instead of stacking them at one end. Nothing scores round order.

**Why the offset.** B is a circle and each round takes the next s seats of it, so after any number of rounds two B teams differ by at most one game. After p rounds the blocks return to where they began (p·s is a multiple of b); the extra `floor(r / p)` then shifts every block by one seat, so S[j] meets a new opponent. Over b rounds the offsets take every value 0 … b − 1 once, which is why no pair meets twice.

**Worked: S = [s0, s1], B = [b0, b1, b2], 3 rounds.** gcd 1, p = 3.

| r | offset | s0 plays | s1 plays | Host |
|---|---|---|---|---|
| 0 | 0 | b0 | b1 | s0, then b1 |
| 1 | 2 | b2 | b0 | b2, then s1 |
| 2 | 4 | b1 | b2 | s0, then b2 |

Each S team has 3 games against 3 opponents; each B team has 2. A fourth round would repeat a pair, so it is not generated.

**Sample league, 6 and 9 teams, 4 rounds.** gcd 3, p = 3. Offsets 0, 6, 12, 19, that is seats 0–5, 6–2, 3–8, 1–6. Every one of the 6 has 4 games against 4 opponents; the 9 have 2, 3, 3, 3, 3, 3, 3, 2, 2 games (24 games in all).

**Scoring.** Every hard rule and `REST`, `LONG_GAP` read a crossover game like any other. For `SLOT_EQUITY` and `FIELD_EQUITY` each side of a game is counted in **its own** division: the home team in `division`, the away team in `awayDivision ?? division`. A division's teams are the teams that appear on a side measured in it. `REMATCH` never fires on a crossover game (one leg).

**Fixture.** X = {A, B}, Y = {D, E}. A–B Tue 18:00 F1, D–E Tue 18:00 F2, A–D Thu 19:30 F2 (A hosts), A–E next Tue 19:30 F1 (E hosts). In X at 19:30: A 2, B 0, spread 2, one unit × weight 2 = **2**. In Y at 19:30: D 1, E 1. Fields: A has F1 2 and F2 1, B has F1 1 and F2 0; D has F2 2, E has F2 1 and F1 1: every spread is 1. No rest or gap violation. Soft cost **2**, one `SLOT_EQUITY` naming A and B. Counted by the game's own division instead, X would hold A, B and D and the 19:30 column would read 1, 0, 1: cost 0, which is the wrong answer this fixture exists to catch.

## 10. A withdrawn team's games (L-036, D-52)

No engine function. The app builds the draft, and the engine only scores it.

1. When a team withdraws, its games with no score are **off the schedule**. Its scored games are played games like any other (§7: never displaced, never moved).
2. The withdrawal draft is the published assignment with the off-schedule keys deleted. `reschedule` and `generateSchedule` are not called. Every other game keeps its slot, checked game by game in the test (D-12).
3. The input the draft is scored and hashed with has the off-schedule games removed from `games`, so they are not `unplaced` (D-9 is about games the season still owes).
4. Afterwards the loader drops every game of a withdrawn team that the published version does not hold. Reschedule, "regenerate the rest", the quality table and the public page therefore never see them. The freed slots are ordinary free slots.
5. The round-robin is not rebuilt. The remaining teams keep their pairings, keys and rounds, and have an open date where the withdrawn team was.
