# 00 — Master PRD: Bracketry — Sports League Scheduler

**Sample business:** "Eastside Rec Softball," a volunteer-run adult league: 2 divisions (9 and 6 teams), 2 fields, Tuesday and Thursday evenings, a spring season and a playoff weekend.
**Builder:** Solo, in Claude Code. Build log rank 18 (`league`).
**Status:** v1.0 — 2026-10-05. Supersedes the compact and "full" drafts from the 2026-09-25 planning chat.
**Precedence:** `07-decisions.md` amends this document. Where they conflict, the decision log wins.
**Normative specs:** `01-generator-spec.md` (round robin, feasibility, scoring, repair, reschedule) and `02-standings-bracket-spec.md` (tiebreakers, brackets). Signatures, counting rules and worked fixtures come from those two files and from `src/lib/league/types.ts`, not from the prose here.
**Portfolio check:** `03-uniqueness-audit.md` lists every feature here against the other 42 cards in the build log.

**Learning objectives:** a computer that writes the schedule (hard and soft constraints, generate → score → repair), reproducibility under a seed, feasibility arithmetic before generation, standings through an ordered tiebreaker chain, single-elimination bracket generation.

---

## 1. Problem statement

Every other project in the portfolio records events a person chose: a booking, an order, a shift. A league has to invent its season. Every team plays every other team, on two fields with a handful of evening slots, around the dates teams can't play, without anyone playing twice in a night, and fairly enough that no coach can say their team got every late game.

Volunteer commissioners do this in a spreadsheet. It takes a weekend, it breaks the first time it rains, and the standings argument at the end of the season (three teams tied, each having beaten one of the others) is settled by whoever is loudest.

The product has three jobs:

1. **Write a valid season from the inputs**, say plainly when the inputs cannot work, and show what the schedule costs each team.
2. **Survive change**: a rainout moves the fewest games possible, and every published schedule stays on record.
3. **Rank and seed without argument**: standings come from results through a written chain of tiebreakers, each row says why it is where it is, and the playoff bracket follows from the standings.

## 2. Goals

1. From teams, fields, slots and blackout dates, a complete season generates in one action, and the same inputs with the same seed give the same schedule (same fingerprint).
2. An impossible season is refused before generation with the arithmetic shown ("36 games, 32 slots, short by 4").
3. No published schedule has a hard violation. Soft violations are counted, priced and listed in plain language.
4. A rainout moves only the rained-out games. Every other game keeps its slot.
5. Standings resolve ties through a configurable ordered chain, including the three-way circle, and each row carries its reason.
6. A single-elimination bracket generates from final standings with standard seeding and byes, and results feed forward to a champion.
7. **(Builder goal)** Constraint modelling, a local-search repair loop reported without overclaiming, seeded determinism, ranking-chain logic, bracket structure.

## 3. Non-goals

- **An optimal solver.** No OR-tools, no integer programming. The heuristic is the lesson; the seam for a solver is the scoring function (D-2).
- **Referee or umpire assignment.** That is a crew-assignment problem (Groundwork's territory).
- **Player rosters, eligibility, waivers, registration, payments.** A team is a name and a contact.
- **Live scoring.** A score is entered once, after the game, in a form.
- **Double elimination, pool play, re-seeding between rounds.** Single elimination only (D-15).
- **Variable game lengths and travel time between fields.** All slots in a season are the same length (D-7).
- **Coach and player accounts.** Only league staff sign in; everyone else reads public pages (D-16).
- **Real SMS or email delivery in the demo.** Notices go through the foundation's outbox and are captured locally (D-18).

## 4. Personas

- **Commissioner** (org owner or admin). Sets up the season, generates and publishes schedules, handles rainouts, resolves the rare unbreakable tie, generates the bracket.
- **Scorekeeper** (org member). Enters and corrects scores. Cannot publish or change a schedule.
- **Coach / player / parent.** No account. Reads the public schedule, standings and bracket.

## 5. Epics and stories

Story IDs are the acceptance criteria. Backlog rows in `06-backlog.md` point here.

### SEASON — setup

- **SEASON-01** A season has a name, a timezone, a first and last day, a game length in minutes, and a status: `draft → scheduled → in_play → playoffs → complete`.
- **SEASON-02** Divisions belong to a season; teams belong to a division. Each division is single or double round robin. Team names are unique in a season.
- **SEASON-03** Fields belong to the organization. A season's slot inventory is built from weekly patterns (weekday, start time, field) across the season window, then materialized as individual slots. A single slot can be closed or added by hand.
- **SEASON-04** A blackout is (team, day, optional reason). A commissioner can bulk-enter a holiday for every team.
- **SEASON-05** Rules per season: maximum games per team per day, minimum rest days, maximum gap, minimum days between rematches, and the five soft weights. Defaults come from `DEFAULT_RULES`.
- **SEASON-06** All divisions in a season share one slot inventory and are scheduled together.
- **SEASON-07** (L-030) A commissioner can change a team's name and contact email. A blank email clears it; a name already used in the season is refused. Nothing else about a team changes, and no game moves.
- **SEASON-08** (L-030) On the season page's team list a team with no contact email says so, with what it costs: no notice when its games move. This is shown to every member; the email itself is shown only in the commissioner's edit form.
- **SEASON-09** (L-038) A commissioner can start a season as a copy of another one in the same organization: a new name, first day and last day are typed; the timezone, game length, rules, standings settings and crossover rounds are taken from the source; every division (name, single or double) and every team (name, contact email) is created again; every weekly slot pattern is created again and materialized across the new window. Fields belong to the organization (SEASON-03) and are not duplicated. The copy starts in `setup` with no games, pins, versions or results.
- **SEASON-10** (L-038) Nothing dated is copied: blackouts, slots closed or added by hand, and makeup slots stay with the source. The source season is not changed. A backwards window or a day that is not a real day is refused; another organization's season is not found. The copy is one transaction and one audit row naming the source.
- **SEASON-11** (L-043) A new season's first and last day must be real days; `2026-02-30` is refused with a message and nothing is stored.

### GEN — generation

- **GEN-01** Feasibility runs before generation and on every input change. It reports games needed, slots available, effective capacity and each team's capacity, and lists each shortfall with a number and a sentence. A failing check blocks generation. The screen says "these inputs could fit", never "will fit" (D-8).
- **GEN-02** Round-robin pairings come from the circle method. Completeness is asserted on every run: every pair exactly once (twice for double), nobody twice in a round, one bye per round for an odd count.
- **GEN-03** Generation takes a seed. The seed, an input hash and the schedule fingerprint are stored with the result. Re-running with the same inputs and seed reproduces the fingerprint; the console has a "new seed" button.
- **GEN-04** The generator never returns a hard violation. Games it cannot place legally are returned as unplaced, each with a reason, and the result cannot be published (D-9).
- **GEN-05** The report shows, for each run: hard count, unplaced count, soft cost before and after repair, iterations run and moves accepted, and every remaining soft violation in a sentence a coach would understand.
- **GEN-06** A commissioner can pin a game to a slot ("rivalry night"). Pinned games never move; generation works around them. A pin that is illegal on its own is refused when it is set.
- **GEN-07** Generation is bounded: at most 16 teams per division and 200 games per season, with an iteration cap. Over the limit is refused with the limit stated (D-17).
- **GEN-08** (L-029) Once any game in the season has a score, plain generation is refused and stores nothing, and the console shows no Generate or New seed button; it points to "Regenerate the rest" (RAIN-05), which keeps played games where they were played.

### SCHED — versions and publishing

- **SCHED-01** Every generation or reschedule creates a new schedule version in `draft`. Versions are never edited after creation.
- **SCHED-02** Publishing requires zero hard violations and zero unplaced games, and a reason line. Exactly one version per season is `published`; the previous one becomes `superseded` and stays viewable.
- **SCHED-03** The version list shows number, seed, fingerprint (first 12 characters), who, when, why, and the score summary. Two versions can be compared: games that changed slot, with from and to.
- **SCHED-04** The database refuses two games in one slot within a version, and two published versions in one season (D-10, D-11).

### RAIN — reschedule

- **RAIN-01** The commissioner closes a day or individual slots and may add makeup slots. The tool lists the displaced games.
- **RAIN-02** Reschedule proposes a new draft version in which only displaced games have moved. Every other placement is identical to the published version (D-12).
- **RAIN-03** A displaced game with no legal makeup slot is listed as unplaced with the reason. It is never double-booked.
- **RAIN-04** Publishing a reschedule queues a notice to each affected team's contact through the outbox, naming the game, the old slot and the new one.
- **RAIN-05** "Regenerate the rest of the season" is a separate, explicit action that pins every game already played and warns how many future games will move.

### SCORE — results

- **SCORE-01** A scorekeeper enters runs for each side, or marks a forfeit by one side. Only games on or before today (season timezone, injected clock) accept a score.
- **SCORE-02** Results are append-only. A correction is a new row that supersedes the old one and records who and why. The history of a game's result is viewable.
- **SCORE-03** A score for a game that is not in the published version, or a second score entered without marking it a correction, is refused.
- **SCORE-04** (L-027) The run boxes start empty. A score with an empty run box and no forfeit is refused and stores nothing; a typed 0-0 is a tie. A forfeit is accepted with the boxes empty.
- **SCORE-05** (L-027) When a game has a score, the form opens with "correction" ticked and shows the reason field; the reason field is not shown before there is a score.
- **SCORE-06** (L-027) The run boxes, the forfeit choice and a forfeit in the result line and the history name the two teams, never "home" or "away".
- **SCORE-07** (L-027) A saved tie reads as a tie: the score is followed by "(Tie)".
- **SCORE-08** (L-027) A time in the result history is in the season's timezone, not UTC.
- **SCORE-09** (L-027) Correcting a playoff score requires a reason, as a season correction does. The bracket row is still overwritten (D-32), so the reason is kept in the audit row.
- **SCORE-10** (L-028) The results list opens with the games on or before today (season timezone) that have no score, under a heading for each field, in date and time order. Every other game follows in date order.
- **SCORE-11** (L-028) A game after today shows no score form. The action still refuses it (SCORE-01).
- **SCORE-12** (L-028) Above the list is the number of played games still without a score.
- **SCORE-13** (L-031) The score form ends with a confirm line naming the two teams, the day, the time and the field. The browser does not send the form until it is ticked.
- **SCORE-14** (L-031) A season game's score can be voided with a reason. The void is a new row that supersedes the score; nothing is deleted, and the database refuses a void that supersedes nothing, has no reason or carries a score. A game with no score cannot be voided.
- **SCORE-15** (L-031) A voided game has no score (D-45): it is back among the games without one and in their count, it is out of the standings, the public page shows it as any unscored game, and a rainout may move it. The next score is a plain entry, not a correction. The commissioner's history lists the voided score, the void, who and why.

### STAND — standings

- **STAND-01** Standings are computed from results on read. No rank, point total or differential is stored as truth (D-13).
- **STAND-02** Points for win, tie and loss, the per-game run differential cap, the forfeit score and whether forfeits count in runs are season settings.
- **STAND-03** Ties on points resolve through the season's ordered chain. A commissioner can reorder the chain and pick restart or continue before the first game; after that a change needs a reason and is logged.
- **STAND-04** Every row shows why it is ranked where it is: "2nd via head-to-head over Cubs".
- **STAND-05** A tie the chain cannot break shows as a shared rank flagged "needs commissioner decision". The commissioner records the order and the method (coin flip, drawn lots); the entry is append-only. The system never picks.
- **STAND-06** Head-to-head and other tied-scope steps are skipped while the tied teams have not all played each other the same number of times.
- **STAND-07** (L-037) A commissioner can edit STAND-02's settings on the standings page: points for a win, a tie and a loss (whole numbers, 0 to 9, a win worth at least a tie and a tie at least a loss), the run differential cap (1 to 99), the forfeit score (0 to 99) and whether a forfeit's runs count. An empty box is refused, never read as 0. A member who cannot change setup sees the values and no form.
- **STAND-08** (L-037) Before the first score the settings change freely; after it a change needs a reason. Every change is logged with the values before and after, and two commissioners saving at once cannot both win (the same guard and version counter as the tiebreak chain, STAND-03).
- **STAND-09** (L-037) A change stores nothing but the settings. The table is worked out again on the next read from the scores already entered (STAND-01), and a bracket already generated keeps its seeding and shows BRKT-03's warning if the table under it changed (D-15).

### BRKT — playoffs

- **BRKT-01** A bracket is generated per division from final standings for the top N teams (N chosen by the commissioner, 2 to 16). Blocked while any included team still needs a commissioner decision.
- **BRKT-02** Standard seeding; byes go to the top seeds; the better seed is the home team.
- **BRKT-03** The seeding is frozen when the bracket is generated and stores the standings it came from. A later result correction does not silently reseed; it raises a warning with a "regenerate bracket" action, allowed only before the first playoff result.
- **BRKT-04** Playoff games are placed into slots with the same hard rules as the season (one game per slot, a team once per day, blackouts), round by round.
- **BRKT-05** A result feeds the winner forward. Ties are refused. A forfeit advances the other team. A result can be corrected until the next game in that line has a result.
- **BRKT-06** (L-034) Publish scores the draft together with every playoff game that holds a slot, through `scoreSchedule` (D-4). A draft that puts a season game in a playoff game's slot, or a team in a season game and a playoff game at the same time or past the daily limit, is refused and nothing is published. Only a clash between a season game and a playoff game refuses here; the draft's own report is checked as before.
- **BRKT-07** (L-034) Placing playoff games queues one notice per team in them through the outbox, in the same transaction as the placement, naming the round, the two teams, the old slot (or "not scheduled") and the new one. The action reports how many notices were queued and how many teams have no contact email.
- **BRKT-08** (L-042) The rainout tool sees every placed playoff game. Reschedule and "Regenerate the rest" hand the engine those games as games that do not move, so a season game is never proposed where it would be a hard violation against one (a team twice in a day, too little rest); with no other legal slot it is unplaced with the reason (RAIN-03). The draft that is stored, and its report, hold season games only.

### PUB — public pages

- **PUB-01** A public, read-only league page per season: schedule by day and by team, standings with reasons, bracket. It shows the published version only.
- **PUB-02** A game that moved in the latest version carries a "moved from" mark for 7 days.
- **PUB-03** Public pages expose team names, slots, fields and scores. No contact details, no audit data, no draft versions.
- **PUB-04** (L-032) The team link, `?team=<name>`, opens on that team: above its schedule is its next game, the first on or after today (season timezone) with no score, or a line saying it has none left.
- **PUB-05** (L-032) A day on the public page reads "Sat Oct 18": in the day headings, the "moved from" mark and a playoff game's slot. It is worked from the day string, never from an instant (D-6).
- **PUB-06** (L-032) Under the season name is "Schedule updated" with the time the shown version was published, in the season's timezone, and below it the games that version moved, each with its new and old slot, for as long as PUB-02's mark stands. With a team picked, only that team's.
- **PUB-07** (L-032) The standings fit a phone: the reason sits under the team name, not in a column of its own, and at 390 px wide the page does not scroll sideways.
- **PUB-08** (L-032) Once a division has a bracket, its standings carry a playoff line under the last qualifying place, with the number of teams the bracket was seeded with. Before a bracket there is no line (D-46).
- **PUB-09** (L-032) A playoff game is named by its round, counted from the end: Final, Semifinal 1, Quarterfinal 3, and "Round 1 game 2" before that. A side still to be decided reads "winner of Semifinal 1".
- **PUB-10** (L-035) The public page has a "Games by time and field" table for each division: one row per team with its number of games in the published version, then one column per start time and one per field, each holding that team's count (a 0 is shown as 0). Every number is read from `scheduleQuality`; the page and its loader count nothing themselves (D-4). Regular-season games only, crossover games included.
- **PUB-11** (L-035) The table is names and counts (PUB-03): it goes through an allowlist projection like the rest of the page, and carries no rest days, bye weeks, cost, violations or ids. A wide table scrolls inside its own box, so the page still does not scroll sideways at 390 px (PUB-07).

### QUAL — schedule quality

- **QUAL-01** A per-team table for any version: games, home and away, games per start time, games per field, shortest and longest rest, byes. The numbers come from the same scoring function as generation (D-4).
- **QUAL-02** Where a floor on the soft cost can be shown by counting, the report states it next to the achieved cost (D-5).

## 6. Nice to have (P1)

- **WHATIF-01** What-if standings: enter hypothetical results for remaining games and see the table. Pure-function reuse.
- **WHATIF-02** Clinched and eliminated flags on points, by exhaustive enumeration when 12 or fewer games remain in the division, otherwise not shown. Stated as such on the page.
- **ICAL-01** A subscribable calendar feed per team for the published version.
- **ICAL-02** (L-034) A team's feed also carries its playoff games that have a slot and two known teams, described by division and round (PUB-09), the better seed at home (BRKT-02). They reach the feed through the same allowlist projection as a season game (PUB-03). A game whose teams are not yet known is not in any feed.
- **BENCH-01** The same season inputs are given to an LLM, which is asked for a schedule as JSON. Its answer is scored by `scoreSchedule` and shown beside the generator's: hard violations, unplaced games, soft cost, cost in dollars, seconds. This is the write-up's "when not to use a model" evidence. No result is assumed in advance.
- **DBL-01** Crossover games between divisions.

## 7. Future (P2)

Double elimination. Multi-division playoffs with cross-seeding. A real solver behind the same scoring function. Umpire assignment. Per-field time preferences (lights, infield size).

## 8. Data model (canonical names)

Tables live in `prisma/schema/bracketry.prisma`. Every table carries `orgId`. Days are `CHAR(10)`, wall times `CHAR(5)` (D-6).

| Entity | Key fields | Notes |
|---|---|---|
| `Season` | name, timezone, firstDay, lastDay, gameMinutes, status, rules (JSON), standingsConfig (JSON), standingsConfigVersion | |
| `Division` | seasonId, name, legs (1 or 2) | |
| `Team` | divisionId, name, contactEmail? | unique (seasonId, name) |
| `Field` | orgId, name | |
| `SlotPattern` | seasonId, weekday, start, fieldId | the weekly rule |
| `FieldSlot` | seasonId, day, start, fieldId, status (`open` / `closed` / `makeup`) | unique (seasonId, day, start, fieldId) |
| `Blackout` | teamId, day, reason? | unique (teamId, day) |
| `Game` | seasonId, divisionId, key, round, leg, homeTeamId, awayTeamId | unique (seasonId, key) |
| `Pin` | gameId, fieldSlotId | unique (gameId) |
| `ScheduleVersion` | seasonId, number, seed, inputHash, fingerprint, status (`draft` / `published` / `superseded`), report (JSON), iterations, accepted, reason, createdBy, publishedAt | partial unique (seasonId) where status = `published` |
| `Placement` | scheduleVersionId, gameId, fieldSlotId | unique (versionId, gameId) and unique (versionId, fieldSlotId) |
| `GameResult` | gameId, homeRuns, awayRuns, forfeit?, supersedesId?, reason?, enteredBy, enteredAt | append-only (trigger) |
| `TieResolution` | divisionId, teamIds (ordered JSON), method, decidedBy, decidedAt | append-only (trigger) |
| `Bracket` | divisionId, size, seeding (JSON snapshot), standingsFingerprint, createdBy | |
| `BracketGame` | bracketId, matchId, round, index, aTeamId?, bTeamId?, aRuns?, bRuns?, forfeit?, winnerTeamId?, fieldSlotId? | unique (bracketId, matchId) |

## 9. Success metrics (seeded, all checked by tests or by the capstone script)

- Round-robin completeness holds for every size from 2 to 16, single and double.
- The four feasibility fixtures return the exact numbers in spec 01 §3.
- The bad-schedule fixture scores exactly 6 hard and 31 soft (spec 01 §4.3).
- Capstone season (9 teams, 2 fields, 7 weeks, 3 blackouts, minimum rest 3 days): publishable, same fingerprint on a second run, soft cost between the provable floor of 100 and 130.
- Rainout: every non-displaced game keeps its slot.
- Standings fixtures ST-1 to ST-9 pass, including the three-way circle under both restart and continue.
- Brackets for 2, 5, 6, 8 and 12 teams match spec 02 §6.
- **Capstone demo, one command:** 9 teams → feasibility → generated season → simulated results (seeded) with a forced three-way tie → standings resolved through the chain → bracket → champion. Then a live rainout.

## 10. Phasing

1. **Engine** (L-001 to L-010): pure functions, no UI, the pending suites turned green one per session, ending in the capstone script.
2. **Commissioner app** (L-011 to L-018): data model, season setup, generation console, versions and publish, scores, standings, rainout, bracket.
3. **Public and proof** (L-019 to L-022): public pages, quality report, seeded demo and e2e, write-ups and deploy.
4. **P1** (L-023 on): what-if and clinch, calendar feed, the LLM benchmark, crossover games.

## 11. Open questions for the owner

| # | Question | Default taken |
|---|---|---|
| OQ-1 | Port for this repo | **5100** (settled 2026-10-06: 3000–5000 are claimed in project configs) |
| OQ-2 | Is BENCH-01 (LLM against the generator) in scope? | P1, after the core ships |
| OQ-3 | Public or private repo | same as the other foundation clones (private, per `CLONES.md`) |
| OQ-4 | Sport vocabulary: "runs" (softball) throughout | softball |
| OQ-5 | Second division in the P0 demo, or P1 | P0: the engine handles it at no extra cost and it makes shared fields a real constraint |
