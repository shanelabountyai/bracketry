@AGENTS.md

# Bracketry — Sports League Scheduler

A rec-league scheduler: the software writes the season under constraints, ranks teams through a tiebreaker chain, and generates the playoff bracket. Sample project, built to professional standards. Cloned from `saas-foundation`; build log card 18 (`league`).

## How to work in this repo

- Product source of truth: `docs/prds/`. Build order: `docs/prds/06-backlog.md`, top to bottom, **one item per session**.
- `docs/prds/07-decisions.md` overrides any conflicting PRD text. Never re-open a settled decision; append a new one.
- `docs/prds/01-generator-spec.md` and `02-standings-bracket-spec.md` are **normative** for everything in `src/lib/league/`, together with `src/lib/league/types.ts`. Counting rules, signatures and fixture values come from there, not from PRD prose.
- At the start of a session read `NEXT.md`, then the backlog item, its story IDs in `00-master-prd.md`, and every decision it cites.
- The gate: `npm run lint && npm run typecheck && npm test && npm run foundation:drift`. Add `npm run test:e2e -- <spec>` for the specs an item touches.
- After an item: gate → mark it ✅ in `06-backlog.md` → add its entry to `docs/PROGRESS.md` (what it built, what it decided, what it left behind, and any measured numbers) → update `WRITEUP.md` → write the next item into `NEXT.md` → commit as `L-006: repair loop` → push once → watch CI and confirm it is green before saying "done".
- Template-owned paths (`src/core`, `src/modules`, `tests/invariants`, the security routes, core Prisma files) are never edited here. If one needs a change, stop and say so.

## The engine rules (what this project exists to practise)

- **`src/lib/league/` is pure.** No database, no Prisma types, no imports from `@/core`, `@/app` or `@/modules`, no clock, no `Math.random`, no process timezone. Routes and actions load rows, call the engine, and store what it returns.
- **Deterministic under a seed (D-3).** All randomness is `mulberry32(seed)` from `prng.ts`. When iterating a `Map`, `Set` or object whose order could vary, sort first. Same inputs and seed must give the same fingerprint; a test asserts it.
- **One scoring function (D-4).** `scoreSchedule` is the only place a scheduling rule is implemented. The repair loop, the publish gate, the reschedule tool and the quality table call it. Never restate a rule in SQL, a component or a test helper.
- **Unplaced, never illegal (D-9).** The generator returns a game as unplaced before it returns a hard violation. An impossible season is a normal return value, not an exception.
- **Never "optimal" (D-5).** This is a heuristic. Screens, comments, commit messages and write-ups say what was measured: cost before and after, iterations, accepted moves, and the floor where one can be counted. Do not add a solver library (D-2).
- **Reschedule moves only displaced games (D-12).** If a change would move any other game, it is a bug.
- **Days are strings (D-6).** `'YYYY-MM-DD'` in `CHAR(10)`, wall times `'HH:MM'` in `CHAR(5)`, arithmetic through `days.ts`. No `@db.Date`, no `new Date(string)`, no `toISOString().slice(0, 10)`.

## What the database enforces

- One game per slot within a schedule version, and one placement per game: unique indexes (D-11). Write and map the unique violation; never check-then-write.
- One published version per season: a partial unique index in a hand-written migration (D-10).
- Schedule versions and placements are never updated after creation. A change is a new version.
- `GameResult` and `TieResolution` are append-only by trigger. A correction is a new row that supersedes the old one (D-13).

## Standings and brackets

- Standings are computed from results on read. Nothing derived is stored as truth (D-13).
- The tiebreak chain is a short ordered list in season settings. It is not a rules engine and must not grow into one (D-14).
- The system never breaks a tie at random. An unbreakable tie is a shared rank until a commissioner records a decision.
- Bracket seeding is a frozen snapshot. A late result correction warns; it never reseeds silently (D-15).

## Tests

- The engine's suites ship as `tests/unit/league-*.pending.ts`. An item starts by renaming its suite to `.test.ts` and seeing it fail with `NotImplementedError`, and ends with it green (D-20).
- **Do not edit an expected value to make a test pass.** Every fixture number is worked by hand in the specs. If one looks wrong, stop and show the owner the arithmetic.
- Every real dispute or bug found later becomes a fixture before it is fixed.

## Scope

Not in this project: umpire assignment, rosters, registration, payments, live scoring, double elimination, variable-length games, coach accounts. See `00-master-prd.md` §3 and `03-uniqueness-audit.md` §5 before adding anything that sounds like another project on the build log.
