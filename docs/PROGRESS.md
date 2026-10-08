# Progress

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
