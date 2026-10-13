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
| 24 | ✅ L-023 | What-if standings and clinched/eliminated flags with the 12-game enumeration limit | WHATIF-01, WHATIF-02 | M | L-016 |
| 25 | ✅ L-024 | Calendar feed per team | ICAL-01 | S | L-019 |
| 26 | ✅ L-025 | LLM-against-generator benchmark, scored by `scoreSchedule`, with cost and time. Needs the owner's go-ahead (OQ-2) | BENCH-01 | M | L-010 |
| 27 | ✅ L-026 | Crossover games between divisions | DBL-01 | M | L-013 |

## P2: persona review (2026-10-12)

From three read-only reviews in the chairs of the PRD's personas (commissioner, scorekeeper, coach/parent) after L-026. They read the docs and the screens; nothing was run, and phone layout was judged from markup only. These rows have no story IDs: write the acceptance criteria into `00-master-prd.md` at the start of the item. Quick fixes first, then by how hard a season breaks without it. Two review claims were checked and dropped: the public page shows no contact details, and crossover rounds can be set on the season page.

| # | ID | Item | Persona | Size | Model | Depends on |
|---|---|---|---|---|---|---|
| 28 | ✅ L-027 | Score entry fixes: run boxes empty and required (an untouched form saves 0-0 today); "correction" ticked and the reason shown when a score exists; team names in place of "home/away" on the run boxes and the forfeit choice; "Tie" echoed on a saved tie; history times in league time, not UTC; a bracket correction asks for a reason like a season one | Scorekeeper | S | Sonnet | L-015 |
| 29 | ✅ L-028 | Results for tonight: games on or before today with no score first, grouped by field; no form on a future game; a count of played games still unscored | Scorekeeper | S | Sonnet | L-027 |
| 30 | ✅ L-029 | Plain Generate is not offered once any game has a score; only "Regenerate the rest" (closes the open note from L-017) | Commissioner | S | Sonnet | L-017 |
| 31 | ⬜ L-030 | Edit a team: name and contact email; a team with no contact email is flagged on the teams list at setup, not only counted at publish | Commissioner | S | Sonnet | L-012 |
| 32 | ⬜ L-031 | A score entered on the wrong game: a confirm line before saving, and a way to void a season game's score as a new superseding row, never a delete (D-13). Needs a decision on what a voided game shows | Scorekeeper | M | Opus | L-027 |
| 33 | ⬜ L-032 | Public page on a phone: a per-team link that opens on that team with its next game; dates as "Sat Oct 18"; an "Updated" time and a list of this week's changes; standings that fit (the reason under the team name); the cut line; round names in the bracket | Coach / parent | M | Sonnet | L-019 |
| 34 | ⬜ L-033 | A rained-out day shows as postponed on the public page as soon as its slots are closed, before a new version is published. Needs a decision: it adds slot status to the public projection (D-33) | Coach / parent, commissioner | M | Opus | L-017, L-019 |
| 35 | ⬜ L-034 | Publish looks at playoff games; playoff games are in the calendar feed and get a notice (closes the open notes from L-018 and L-024) | Commissioner, coach / parent | M | Opus | L-018, L-024 |
| 36 | ⬜ L-035 | Public fairness table: each team's count of games per start time and per field, from `scheduleQuality` and nothing else (D-4) | Coach / parent | S | Sonnet | L-020 |
| 37 | ⬜ L-036 | A team withdraws mid-season: its remaining games are forfeited or removed and the rest rescheduled around it, with played results kept. Needs a spec section and a decision before any code | Commissioner | L | Opus | L-031, L-017 |
| 38 | ⬜ L-037 | Editor for points, the run-difference cap and forfeit settings (STAND-02; open from L-016) | Commissioner | M | Opus | L-016 |
| 39 | ⬜ L-038 | Copy a season's divisions, teams and fields into a new season | Commissioner | S | Sonnet | L-012 |
| 40 | ⬜ L-039 | A private preview before a season is public. Reopens D-33: the owner decides first | Commissioner | M | Opus | L-019 |
| 41 | ⬜ L-040 | Scorekeeper role: enter and correct scores and nothing else. Blocked: needs a permission added in `saas-foundation` (D-30), not here | Scorekeeper, commissioner | M | Opus | template release |
| 42 | ⬜ L-041 | Notices leave the outbox: one confirmed send with a mail key. Blocked while the project is not deployed (D-36) | Commissioner | S | Sonnet | deployment |

Also raised and not made an item: the shared 60-per-15-minutes limit on public reads (a parents' group on one field's wifi shares an address) is a template edit, as in the open note from L-019. Not asked for by any persona: the PRD's P2 list (double elimination, cross-division playoffs, a real solver, umpires, per-field time preferences).

What the three said to leave alone: the shared rank with no coin flip and the reason column; a rainout that moves only the displaced games, with the compare step; the append-only score history; calendar entries that move instead of duplicating.
