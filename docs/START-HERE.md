# Start here — building Bracketry with Claude Code

This starter is L-000: the PRD set, two normative specs, the decision log, the uniqueness audit, the backlog, `CLAUDE.md`, the engine's type contract, three small implemented helpers, and six pending test suites (138 tests) whose expected values are worked by hand in the specs.

## What is in the kit

| Path | What it is |
|---|---|
| `CLAUDE.md` | Project rules. Merge into the clone's `CLAUDE.md`, keeping the `@AGENTS.md` line first. |
| `docs/prds/00-master-prd.md` | Problem, goals, non-goals, stories with IDs, data model, success metrics, open questions |
| `docs/prds/01-generator-spec.md` | Normative: round robin, feasibility, scoring, generate and repair, reschedule, with worked numbers |
| `docs/prds/02-standings-bracket-spec.md` | Normative: tiebreak chain, fixtures ST-1 to ST-9, seeding, bracket rules |
| `docs/prds/03-uniqueness-audit.md` | Each feature against the rest of the build log |
| `docs/prds/06-backlog.md` | The ordered build, one item per session |
| `docs/prds/07-decisions.md` | D-1 to D-20. Overrides the PRDs. |
| `src/lib/league/types.ts` | The contract |
| `src/lib/league/{prng,days,fingerprint}.ts` | Implemented, with `tests/unit/league-helpers.test.ts` green (6 tests) |
| `src/lib/league/{round-robin,feasibility,schedule,standings,bracket}.ts` | Stubs that throw `NotImplementedError` |
| `tests/unit/league-*.pending.ts` | The six pending suites. `league-fixtures.ts` holds the shared builders. |

## The loop

One backlog item per session, top to bottom:

1. Read `NEXT.md`, the item in `06-backlog.md`, its stories, its decisions, and the spec sections it names.
2. If the item has a pending suite, rename it to `.test.ts` and run it. Confirm it fails with `NotImplementedError`, not an import or type error.
3. Build until the suite is green. Add tests for anything the suite does not cover.
4. Run the gate: `npm run lint && npm run typecheck && npm test && npm run foundation:drift`
5. Mark the item ✅, add the `docs/PROGRESS.md` entry, update `WRITEUP.md`, write the next item into `NEXT.md`.
6. Commit (`L-003: round robin`), push once, watch CI go green.

## Session 1 — L-001, the clone

Run this in an empty parent folder, with the starter folder beside it. The port is 5100, the next free hundred as of 2026-10-06 (3000–5000 are claimed in project configs).

> Set up the Bracketry repo. Follow the saas-foundation README quickstart exactly: clone the template as `bracketry`, rename the remote to `template`, check out `main` at the latest release tag, `npm ci`, then `npm run new-project -- bracketry 5100`, then `npm run db:setup`. Do not use GitHub's "Use this template" button. Then copy the starter kit from `../bracketry-starter/` into the repo: `docs/`, `src/lib/league/`, `tests/unit/league-*`, and merge its `CLAUDE.md` into the repo's `CLAUDE.md`, keeping the `@AGENTS.md` line first. Leave the billing and notifications modules untouched. Replace `NEXT.md` with a short one that says "PICK UP HERE: L-002". Add the port-table row in `~/.claude/CLAUDE.md` and the clone row in the template's `CLONES.md`. Run the gate (`npm run lint && npm run typecheck && npm test && npm run foundation:drift`) and show me the result. The six `*.pending.ts` suites must not run yet; `league-helpers.test.ts` must pass with 6 tests. Create the private GitHub repo, push, and confirm CI is green. Mark L-001 ✅.

## Session 2 — L-002, guard rails

> Build L-002 from docs/prds/06-backlog.md. Read CLAUDE.md and decisions D-3, D-4 and D-20 first. Add the ESLint rule scoped to `src/lib/league/**`, the `npm run league` CLI skeleton in `scripts/league.ts`, and a `pending:check` script that runs the pending suites with a separate Vitest config and prints, per suite, how many tests fail with NotImplementedError and how many fail any other way. Run it and show me the counts. Expected today: 138 tests across six suites, all failing; 133 with NotImplementedError and 5 "refusal" tests failing on their assertion. If you see an import error, a type error or a timeout, stop and tell me.

## Session 3 — L-003, round robin

> Build L-003. Read docs/prds/01-generator-spec.md §0–§2 and src/lib/league/types.ts first. Rename tests/unit/league-round-robin.pending.ts to .test.ts, run it and confirm all 77 tests fail, then implement `gameKey` and `roundRobin` in src/lib/league/round-robin.ts until they pass. Do not change any expected value. Add the `league pairings --teams N [--legs 2]` command. Finish with the gate and the loop steps in docs/START-HERE.md.

## Session 4 — L-004, feasibility

> Build L-004. Read spec 01 §3 and decision D-8. Rename the feasibility suite, see it red, implement `checkFeasibility`. Each shortfall's `detail` must be a full sentence containing its numbers. Add `league feasibility <file.json>`. Then show me the report for 9 teams over 4 weeks as a commissioner would read it.

## Session 5 — L-005, scoring

> Build L-005. Read spec 01 §4 in full, including the worked example in §4.3, and decision D-4. Rename the score suite, see it red, implement `scoreSchedule`. Before you write code, restate to me in your own words how each of the six hard codes and five soft codes is counted, and wait for my reply. The bad-schedule fixture must come out at exactly 6 hard and 31 soft; if you get a different number, show me your count against §4.3 line by line rather than adjusting anything.

## Session 6 — L-006, generate and repair

The session the project exists for. Give it room.

> Build L-006. Read spec 01 §5 and §6 and decisions D-2, D-3, D-5 and D-9. Before writing the repair loop, show me (1) the move set you will use, (2) how you choose the next move, (3) how you keep iteration order deterministic, and wait. Then rename the generate suite, see it red, and implement the greedy draft, `repair` and `generateSchedule`. Leave the two `reschedule` tests failing for L-007 by marking that describe block `describe.skip` with a comment naming L-007. The capstone must be publishable, identical on a second run, and between 100 and 130 soft cost at seed 2027. Record in docs/PROGRESS.md: soft cost before and after, iterations, accepted moves and wall time for the capstone at seeds 2027, 1, 2 and 3, and say how each compares with the floor of 100. Do not describe any result as optimal.

## Session 7 — L-007, reschedule

> Build L-007. Read spec 01 §7 and decision D-12. Remove the `describe.skip` from the reschedule block, see it red, implement `reschedule`. Then add one more test of your own: rain out a day in the two-division fixture and assert that no game outside the displaced set changed slot.

## Session 8 — L-008, standings

> Build L-008. Read spec 02 §1–§4 and decisions D-13 and D-14. Rename the standings suite, see it red, implement `computeStandings`. Work fixture ST-3 through by hand in your reply before you code it, under both restart and continue, and check your numbers against the spec. Do not add a random tiebreak anywhere.

## Session 9 — L-009, brackets

> Build L-009. Read spec 02 §5–§7 and decision D-15. Rename the bracket suite, see it red, implement `seedOrder`, `buildBracket`, `recordResult` and `champion`. `recordResult` must return a new bracket and leave its input unchanged.

## Session 10 — L-010, the engine capstone

> Build L-010. One command, `npm run league -- capstone --seed 2027`, that runs the whole story in the terminal with no database: feasibility with its arithmetic, the generated season with before and after scores and the floor, seeded results that force a three-way tie, standings with a reason on every row, a six-team bracket played to a champion, then a rainout showing exactly which games moved. Add an integration test that runs it twice and compares the full output. This is the 60-second demo; make the output readable by someone who has never seen the code.

## From L-011 on

Use the same shape: name the item, name what to read, and for L-011 (data model) and L-013 (generation console) ask for the plan first and wait. L-011's pause matters most: the unique indexes and the partial index on the published version are what the app builds against.

> Build L-011 from docs/prds/06-backlog.md. Read 00-master-prd.md §8 and decisions D-6, D-10, D-11 and D-13 first. Before writing the schema, show me the full entity list and the exact SQL for the unique indexes, the partial unique index on the published version, and the two append-only triggers, and wait for me to confirm. Then write `prisma/schema/bracketry.prisma`, the migrations, and constraint tests that insert conflicting rows directly against the database and assert refusal.

## Verified before this kit was handed over

- All six pending suites and the helper suite (144 tests) pass against a throwaway reference implementation of the engine, written only to check the specs and fixtures. It is not in this kit.
- Against the stubs, the helper suite passes (6) and every other test fails: 133 with `NotImplementedError`, 5 refusal tests on their assertion.
- The kit typechecks under `strict` and `noUncheckedIndexedAccess`.
- Not verified: anything about the template beyond what the Callboard clone shows at v1.2.0, and the port.
