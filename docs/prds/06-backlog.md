# 06 — Build backlog: Bracketry

**Sources:** `00-master-prd.md` (story IDs are the acceptance criteria), `07-decisions.md` (overrides PRD text), `01-generator-spec.md` and `02-standings-bracket-spec.md` (normative for L-003 to L-009).

One item per session, top to bottom. ✅ built and committed, ⬜ not started (`grep ⬜` answers "what is next"). Sizes: **S** short session, **M** one focused session, **L** two to three. The loop is in `docs/START-HERE.md`. Suggested model is a suggestion; confirm it at the start of each session.

**Golden paths.** (1) End of Milestone 1: one command generates the capstone season, simulates results, resolves a three-way tie and crowns a champion, with no database. (2) End of Milestone 2: a commissioner does the same in the app, then handles a rainout that moves only the rained-out games.

## Milestone 0: Setup

| # | ID | Item | Stories / decisions | Size | Model | Depends on |
|---|---|---|---|---|---|---|
| 1 | ✅ L-000 | Starter: PRD set, specs, decision log, uniqueness audit, this backlog, `CLAUDE.md`, type contract, implemented helpers (`prng`, `days`, `fingerprint`) with a green suite, six pending suites | — | — | — | — |
| 2 | ✅ L-001 | Clone `saas-foundation` at the latest tag per its README quickstart; `npm run new-project -- bracketry <port>` with the next free port from the port table; add the port-table row; `db:setup`; copy the starter in (`docs/`, `src/lib/league/`, `tests/unit/league-*`, merge `CLAUDE.md` keeping the `@AGENTS.md` line); leave the billing and notifications modules in place unmodified (notifications is used from L-017, D-18; billing is unused and costs nothing to keep); add the clone to the template's `CLONES.md`. Gate green, including `foundation:drift`, with the helper suite passing | D-1, D-19, D-20; OQ-1 | M | Sonnet | L-000 |
| 3 | ✅ L-002 | Engine guard rails: an ESLint rule scoped to `src/lib/league/**` banning `Math.random`, `Date.now`, `new Date()` with no arguments, and any import from `@/core`, `@/app`, `@/modules` or Prisma; a `scripts/league.ts` CLI skeleton (`npm run league -- <command>`) that later items add commands to; a `pending:check` script that runs the pending suites and reports how many fail with `NotImplementedError` | D-3, D-4 | S | Sonnet | L-001 |

## Milestone 1: The engine (pure functions, no UI)

| # | ID | Item | Stories / decisions | Size | Model | Depends on |
|---|---|---|---|---|---|---|
| 4 | ✅ L-003 | `roundRobin` and `gameKey`. Rename `league-round-robin.pending.ts` → `.test.ts`, red, then green. CLI: `league pairings --teams 7` prints rounds and byes | GEN-02; spec 01 §2 | S | Sonnet | L-002 |
| 5 | ✅ L-004 | `checkFeasibility` with the four worked fixtures and the doubleheader case. CLI: `league feasibility` on a JSON input file | GEN-01; D-8; spec 01 §3 | S | Sonnet | L-003 |
| 6 | ✅ L-005 | `scoreSchedule`: six hard codes, five soft codes, plain-language details. The bad-schedule fixture must score exactly 6 and 31 | GEN-05, QUAL-01; D-4; spec 01 §4 | M | Opus | L-004 |
| 7 | ✅ L-006 | `generateSchedule` and `repair`: greedy draft, local search, acceptance rule, bounds, determinism, pins, unplaced-not-illegal. Capstone soft cost within 100–130. **Before writing the loop, show the owner the move set and how iteration order is kept deterministic, and wait.** Record the measured before/after, iterations and wall time in `docs/PROGRESS.md` | GEN-03 to GEN-07; D-2, D-3, D-5, D-9; spec 01 §5–§6 | L | Opus | L-005 |
| 8 | ✅ L-007 | `reschedule`: displaced games only, best legal makeup slot, unplaced when none | RAIN-02, RAIN-03; D-12; spec 01 §7 | M | Opus | L-006 |
| 9 | ✅ L-008 | `computeStandings`: tally, cap, forfeits, chain with scopes, balanced check, restart and continue, shared ranks, manual resolutions, reasons. ST-1 to ST-9 | STAND-01 to STAND-06; D-13, D-14; spec 02 §1–§4 | M | Opus | L-002 |
| 10 | ✅ L-009 | `seedOrder`, `buildBracket`, `recordResult`, `champion` | BRKT-02, BRKT-05; D-15; spec 02 §5–§7 | M | Sonnet | L-002 |
| 11 | ✅ L-010 | **Engine capstone.** `npm run league -- capstone --seed 2027`: build the 9-team season, check feasibility, generate, print the report with the floor; simulate every result from the seed with a forced three-way tie; print standings with reasons; build the bracket for the top 6; play it out; print the champion. Then rain out one day and print what moved. One integration test asserts the whole run is identical on a second call | PRD §9 | M | Sonnet | L-007, L-008, L-009 |

## Milestone 2: The commissioner app

| # | ID | Item | Stories / decisions | Size | Model | Depends on |
|---|---|---|---|---|---|---|
| 12 | ✅ L-011 | Data model and migrations: every §8 entity; unique indexes from D-10 and D-11 including the partial unique index in hand-written SQL; append-only triggers on `GameResult` and `TieResolution` following the template's audit trigger; `CHAR(10)`/`CHAR(5)` columns. **Show the entity list and the index SQL first and wait.** Constraint tests write straight to the database | §8; D-6, D-10, D-11, D-13 | L | Opus | L-010 |
| 13 | ✅ L-012 | Season setup: season, divisions, teams, fields, weekly slot patterns materialized to slots, close/add a slot, blackouts with bulk holiday entry, rules form with defaults. Every action through the foundation's authorization path, with the template's invariant harness rows added in `tests/fixtures/app.ts` | SEASON-01 to SEASON-06; D-16 | L | Sonnet | L-011 |
| 14 | ✅ L-013 | Generation console: live feasibility panel; generate with a seed; store a draft version with seed, input hash, fingerprint, report; show hard/unplaced/soft before and after, iterations, every remaining violation; "new seed". Enforce the D-17 caps | GEN-01, GEN-03 to GEN-05, GEN-07, SCHED-01 | L | Opus | L-012 |
| 15 | ✅ L-014 | Versions and publish: version list, compare two versions, publish with a reason (gate: publishable), supersede the previous. Pins: set, refuse an illegal pin, regenerate around pins | SCHED-02 to SCHED-04, GEN-06 | M | Sonnet | L-013 |
| 16 | ✅ L-015 | Score entry: runs or forfeit, today-or-earlier rule on the injected clock, corrections as superseding rows with a reason, result history | SCORE-01 to SCORE-03; D-13 | M | Sonnet | L-014 |
| 17 | ✅ L-016 | Standings page: table with reasons, chain editor (reorder, restart or continue, logged change after first game), unresolved-tie flag and the commissioner decision form | STAND-01 to STAND-06 | M | Sonnet | L-015 |
| 18 | ✅ L-017 | Rainout tool: close a day or slots, add makeup slots, see displaced games, propose a draft version, publish, queue a notice per affected team. Separate "regenerate the rest" action with its warning | RAIN-01 to RAIN-05; D-12, D-18 | L | Opus | L-014 |
| 19 | ✅ L-018 | Playoffs: generate a bracket for the top N with a frozen seeding snapshot, place playoff games into slots under the hard rules, enter results, feed forward, correction rule, regenerate-before-first-result | BRKT-01 to BRKT-05; D-15 | L | Opus | L-016 |

## Milestone 3: Public pages and proof

| # | ID | Item | Stories / decisions | Size | Model | Depends on |
|---|---|---|---|---|---|---|
| 20 | ✅ L-019 | Public league pages: schedule by day and by team, standings, bracket; published version only; "moved from" mark for 7 days; a projection function that returns public fields only, with a test that fails if a contact field appears. Read the template's spec §7c and §8 before adding a public route | PUB-01 to PUB-03 | M | Opus | L-018 |
| 21 | ✅ L-020 | Schedule quality table per version, with the floor where it can be counted | QUAL-01, QUAL-02 | S | Sonnet | L-013 |
| 22 | ✅ L-021 | Demo data and e2e: `seed:bracketry` builds Eastside Rec Softball (two divisions, published schedule, half a season of results with the three-way tie); `docs/DEMO.md`; one Playwright spec for golden path 2 | PRD §9 | M | Sonnet | L-019 |
| 23 | ✅ L-022 | `WRITEUP.md`, executive write-up, deploy, build-log links | — | M | Sonnet | L-021 |

## P1 (after the above ships)

| # | ID | Item | Stories | Size | Depends on |
|---|---|---|---|---|---|
| 24 | ⬜ L-023 | What-if standings and clinched/eliminated flags with the 12-game enumeration limit | WHATIF-01, WHATIF-02 | M | L-016 |
| 25 | ⬜ L-024 | Calendar feed per team | ICAL-01 | S | L-019 |
| 26 | ⬜ L-025 | LLM-against-generator benchmark, scored by `scoreSchedule`, with cost and time. Needs the owner's go-ahead (OQ-2) | BENCH-01 | M | L-010 |
| 27 | ⬜ L-026 | Crossover games between divisions | DBL-01 | M | L-013 |
