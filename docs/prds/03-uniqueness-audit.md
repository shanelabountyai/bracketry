# 03 — Uniqueness audit: Bracketry against the rest of the build log

**Date:** 2026-10-05.
**Checked against:** all 43 cards in the build log artifact (24 ranked business builds including this one, 3 unranked, 6 AI track, 10 automation track), read from the published page. Two repos were also read directly: `bookable-appointment-service` and `callboard`. The other repos were not opened, so a row that cites one of them rests on its build-log card or its PRD text, and says so.

## 1. Verdict

Bracketry's core is not taught anywhere else on the list: no other card has the software write a schedule under constraints, score it, and improve it. Four parts of the earlier Bracketry draft did overlap shipped or planned projects. Each is listed in §3 with what changed.

## 2. What only Bracketry has

| Feature | Stories | Nearest neighbour, and why it is not the same |
|---|---|---|
| Schedule generated from inputs: hard and soft constraints, one scoring function, a repair loop | GEN-02 to GEN-05 | **Bookable** finds open slots for one booking a person chose; it never composes a calendar. **Groundwork** orders one crew's stops (per its card: "route ordering"), a single-objective ordering with no hard/soft model. **Knotwork** (not built) schedules backward from a date, which is date arithmetic. |
| Feasibility check with the arithmetic shown, before anything is generated | GEN-01 | No card mentions one. |
| Seeded determinism and a schedule fingerprint | GEN-03 | The injected clock is a house convention; a seeded PRNG is not on any card. Bookable's repo uses `fast-check`, which seeds its own test inputs, not the product's output. |
| A provable floor reported beside the heuristic's result | QUAL-02, spec 01 §6.4 | **Pulseboard** reports measured performance; nothing reports distance from a bound. |
| Pinned games the generator works around | GEN-06 | None. |
| Schedule versions with one published at a time, and a diff between versions | SCHED-01 to SCHED-04 | **Showcall** versions content files; **Callboard** logs run-of-show changes (verified in its repo: `RosSync`). Neither versions a whole generated plan with a publish pointer. |
| Reschedule that moves only the displaced games | RAIN-02 | See §3 row 1. The guarantee is new; the scenario is not. |
| Standings through an ordered tiebreaker chain with restart or continue | STAND-03 to STAND-06 | **Commons** (not built) ranks posts by score and time decay. That is a formula; this is a procedure over tied subsets. |
| Bracket generation: seed order, byes, feed-forward | BRKT-01 to BRKT-05 | **Commons** comment trees and **Coursework** prerequisite graphs (neither built) are user-shaped structures. A bracket is a fixed-shape tree computed from one number. |
| Per-team schedule quality table | QUAL-01 | None. |
| LLM-against-generator benchmark (P1, optional) | BENCH-01 | **Use-Case Studio** evaluates an LLM pipeline against a rubric. This scores a model's output with the product's own deterministic checker on a task where a non-AI method exists. No AI-track or automation-track card touches scheduling. |
| Calendar feed per team (P1) | ICAL-01 | No `text/calendar` or `VCALENDAR` in the Bookable or Callboard repos (searched). Other repos not checked. |

## 3. Overlaps found, and what changed

| # | Earlier draft said | Overlaps | Change made |
|---|---|---|---|
| 1 | "Rainout reschedule: Groundwork's cascade, smaller" | **Groundwork** (shipped, per its card; rain-day cascade as P0, per its PRD summary). **Bookable** (verified in its backlog) rescues a sick provider's day. | Rebuilt around a different guarantee: only displaced games move, tested game by game (D-12). A full regenerate is a separate, explicit action (RAIN-05). The write-up should not present the rainout as new; it should present the stability guarantee. |
| 2 | "Tiebreaker chain is data, not code (Adjuster's pattern)" | **Adjuster** (not started) is the rules-engine project. | The chain is a short ordered list of steps in season settings with four fixed metrics. No expression language, no general rule evaluator (D-14). Bracketry does not claim "rules engine". |
| 3 | "No silent double-bookings" as a feature | **Bookable** (verified: a Postgres exclusion constraint) and **Countertop Reserve** (per its card: allocation as a database constraint). | Kept as a plain unique index per schedule version (D-11). Listed as reuse, not as a lesson. |
| 4 | "Every standings row can render its derivation" as a headline | **Adjuster** decision explanations, **Ledgerleave** balance derivations, **Coursework** derived progress (all planned, none built). | Kept as one story (STAND-04) and treated as a house pattern. Standings as a pure function over append-only results follows the same convention; it is not a headline here. |

## 4. Reused on purpose (not counted as new)

| Capability | Comes from |
|---|---|
| Sign-in, organizations, roles, audit log, rate limits, cron | the `saas-foundation` template (read at v1.2.0 in the Callboard clone) |
| Outbox for schedule-change notices | the foundation's notifications module |
| Injected clock, append-only records, integer-only arithmetic | house conventions |
| Calendar days as strings, never a database date | Bookable's rule (verified in its `CLAUDE.md`) |
| Property-style tests over a size range | Bookable used `fast-check` (verified). Bracketry's pending suites loop over sizes 2 to 16 without adding the dependency. |
| Multi-tenant data model | the foundation's `orgId` scoping. Tenant isolation as a lesson belongs to card 19 and is not claimed here. |

## 5. Left out to avoid duplicating another card

| Idea | Belongs to |
|---|---|
| Umpire assignment | Groundwork (crew assignment) |
| Registration fees, team payments | BoxLoop, LoanBook |
| Capacity, waitlists for a full division | Event Venue / Ticketing |
| Live shared editing of the schedule | Showcall (live run sheet) |
| Importing teams from a messy spreadsheet | Nonprofit (messy data import) |
| Public API and webhooks for schedule changes | card 20 |
| SMS check-in, day-of staffing | Callboard |

## 6. What this audit could not verify

- Shipped repos other than Bookable and Callboard were not read. Groundwork's routing method and cascade are described from its card and PRD summary.
- Unbuilt projects (Adjuster, Coursework, Commons, Ledgerleave, Knotwork, Quorum, Gavel, Gridline, LoanBook) are compared by their PRDs. If one of them is built differently from its PRD, re-check the row that cites it.
