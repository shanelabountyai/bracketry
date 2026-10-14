# Bracketry demo script

About ten minutes. Two parts: the engine on its own in a terminal, then the same story in the app as a commissioner. Every command here was run on 2026-10-12; the numbers quoted are from those runs.

The seeded season is dated around the day you run the seed, because a score is only accepted for a past day and a rainout only moves future games. **Seed on the day of the demo.** Dates below are written as the seed prints them.

## Before you start

```bash
npm ci
npm run db:setup          # creates bracketry and bracketry_test, migrates both; leaves existing .env files alone
npm run seed:bracketry    # Eastside Rec Softball; replaces the league if it is already there
npm run dev               # http://localhost:5100
```

`.env.local` must hold `DATABASE_URL` (local Postgres) and `DEMO_MODE=1`. Both are written by `db:setup`; check with `grep -c '^DEMO_MODE=1' .env.local`.

The seed prints five lines. Keep them on screen: they name the tied teams, the day to rain out and the season URL.

```
Softball 2026: 2026-09-22 to 2026-11-05, 51 games in 56 slots, seed 2027.
Version 1 published: soft cost 301 before repair, 122 after; 4060 iterations, 29 accepted moves.
22 games before 2026-10-12 have a score. Comets, Hawks, Icemen are level on points in A Division, ranked in that order by the tiebreak chain.
Next game day (the one to rain out): 2026-10-13.
Sign in at /demo (DEMO_MODE=1) as commissioner@eastside.demo.test, then open /o/eastside/seasons/<season id>
```

The first two lines are the same on every run. The third depends on the weekday: more game days are behind you later in the week, so the tied teams can differ.

## Accounts

| Who | How to sign in | Where the credential lives |
|---|---|---|
| Commissioner, owner of Eastside Rec Softball | `/demo`, click `commissioner@eastside.demo.test`. No password. | Created by `scripts/seed-bracketry.ts`. Demo sign-in only works for accounts a seed marked, and only with `DEMO_MODE=1`. |
| Anyone (coach, player, parent) | No account. Open `/l/eastside/<season id>`. | Nothing to hold. |

The commissioner has a TOTP secret set, because owners must. It is the fixed public value `DEMO_TOTP_SECRET` in `scripts/seed-demo.ts`; demo sign-in skips the prompt.

## The sample league

Eastside Rec Softball: A Division (Aces, Bandits, Comets, Dukes, Eagles, Falcons, Giants, Hawks, Icemen) and B Division (Jets, Kings, Lions, Mustangs, Nomads, Owls). Two fields, North Diamond and South Diamond. Tuesdays and Thursdays at 18:00 and 19:30 for seven weeks. Everyone plays their own division once: 36 + 15 = 51 games in 56 slots. Comets are away for the whole second week and Giants for one evening of the third. Minimum rest is 3 days.

## Part 1: the engine, no database (2 minutes)

```bash
npm run league -- capstone --seed 2027
```

| Section of the output | What to say |
|---|---|
| 1. Can this season fit? | "Before it tries anything, it counts. 36 games, 56 slots. A pass here means no reason it cannot fit, not a promise that it will." |
| 2. The generated season | "A greedy draft scored 320. A seeded search brought it to 114 in 2,508 tries, 22 of which it kept. By counting, no schedule can score below 100. So this is 14 above the floor. It is a heuristic and it says so." |
| 3 and 4. Results and standings | "Three teams beat each other in a circle and finish level. The right-hand column says in words why each team is where it is." |
| 5. Playoffs | "Top six, the top two get byes. Champion: Dukes." |
| 6. Rainout | "The busiest day is washed out. Four games move to the makeup Saturday. 32 of the 32 other games kept their slot. That last line is the point." |

Run it a second time: the output is identical, character for character. A test checks that.

## Part 2: the app, as the commissioner (8 minutes)

Sign in at `http://localhost:5100/demo`, then Eastside Rec Softball → Seasons → Softball 2026 (or paste the URL the seed printed).

| # | Screen | Do | Say |
|---|---|---|---|
| 1 | Season page, top | Scroll through Divisions, Fields, Weekly slots, Blackouts. | "This is everything the commissioner typed. The software wrote the rest." |
| 2 | Generate | Read the feasibility line: 51 games needed, 56 slots available. Read the Version 1 report. | "Draft 301, after repair 122, 4,060 tries, 29 kept. It reports what it measured. Same league and same seed give the same schedule; that is why the seed is on screen." |
| 3 | Versions → Quality | Click **Quality** on version 1. | "One row per team: home and away, early and late, each field, shortest rest. And the floor: eight games in seven weeks forces ten short rests, so nothing scores below 100. This is at 122." |
| 4 | Standings | Open **Standings**. Find the three teams the seed named. | "Three teams on 4 points, and they have all played each other, one win each. Head-to-head cannot split them. Run difference among the three puts one first; then the chain starts again for the other two and head-to-head settles it. Each row says so." |
| 5 | Playoffs | Open **Playoffs**. In A Division keep 4, click **Generate bracket**. | "The tie just decided who gets the last playoff place. The seeding is frozen now: if a score is corrected later the page warns, it does not quietly reseed." |
| 6 | Season page → Rainout | Add two makeup slots on the Saturday after the last day (**Add makeup slot**, 10:00, one per field). Back on Playoffs, **Place games into slots**. | "Placed 2 of 2. It uses the same legality check as the season schedule." Then try **Save score** on one: it refuses, because the game is in the future. |
| 7 | Season page → Rainout | Add four makeup slots on the Saturday after the rain day (10:00 and 11:30, both fields). Enter the rain day under **Close every slot on**, click **Close day**. | "Closed 4 slots. The displaced games are listed. Nothing has moved yet." |
| 8 | Rainout | Click **Propose reschedule**. | Read the notice aloud: "N of N displaced games moved, 0 have no legal slot. Every other game kept its slot." |
| 9 | Versions | Compare version 1 with version 2. | "Exactly the rained-out games changed slot. The action checks that itself on every run and refuses to save if anything else moved." |
| 10 | Versions | On the draft, type a reason (`Rain on <day>`), click **Publish**. | "Version 1 is kept as superseded. One notice is queued per team whose game moved. The database itself refuses a second published version." |
| 11 | Public page | Open **Public page** in a private window. | "No account. Schedule, standings with reasons, bracket. The moved games say where they moved from. No coach email is on this page; a test checks that." |

## Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| `/demo` is a 404 | `DEMO_MODE` is not `1` in `.env.local`, or the server started before it was set | Set it, restart `npm run dev` |
| No `commissioner@eastside.demo.test` button on `/demo` | The seed has not run against this database | `npm run seed:bracketry` |
| The seed prints `No three A Division teams ... Change SEED` | On this weekday no trio that has all met can be left level on its own | Change `SEED` in `scripts/seed-bracketry.ts`, or seed a day later |
| Every game already has a score, or **Propose reschedule** is greyed out | The seed is days old, or the closed day had no unplayed games | Run the seed again; close the day it prints |
| `Placed 0 of 2 games` on Playoffs | No free slot after today | Add makeup slots first (step 6) |
| `npm run dev` exits at once, or the port is taken | Another server holds 5100, or the memory check refused | `lsof -ti :5100`; stop other projects' dev servers |
| `CLAUDE.md` shows as modified after `npm run dev` | Next's dev server appends an agent-rules block | `git checkout CLAUDE.md` |

## What to concede before you are asked

- **It is a heuristic, never "optimal".** 122 against a counted floor of 100 here, 114 against 100 on the capstone. The floor counts one rule only. No solver library is used, on purpose.
- **A model beat the demo's schedule.** The demo season was given to three Claude models, three times each, and scored by the same function (L-025, one run on 2026-10-12). All nine answers were publishable; Opus 5.5 scored 102, 100 and 100 against the demo's 122, at 60 to 86 cents and four to six minutes an answer. The generator takes under a second, costs nothing, and from seeds 1 to 20 finishes between 100 and 124. The table is in `WRITEUP.md` and the rows in `docs/bench-01-results.json`. Do not rerun it in a demo: `npm run league:bench` needs an API key and spends money; `npm run league:bench -- --dry` prints the prompt and the generator's row for free.
- **The data is synthetic and the app is not deployed.** Eastside Rec Softball does not exist. Scores come from a seeded random generator with the tie forced.
- **The tie is not always at the top of the table.** Mid-season, teams have played different numbers of games, so the seed takes the first trio it can leave level on its own. On 2026-10-12 it was ranks 3 to 5.
- **A champion cannot be crowned live.** A playoff game is scored on or after its day and is only ever placed after today. Part 1 shows the champion; the end-to-end test gets there by moving the slot's date in the test database.
- **Notices are queued, not sent.** No mail key is set on the laptop, so the per-team notices sit in the outbox.
- **Commissioners enter the scores.** A scorekeeper role needs a change to the shared starter (D-30). Coaches have no accounts at all.
- **A draft can be shown before it is public, by a secret link** (D-53): on the season page, "Create preview link" beside a draft version. Anyone with the link can read it until it expires or is revoked, so it is as private as the inbox it was sent to.
- **A published season is public, with no opt-out** (D-33), and public reads share one rate limit of 60 per 15 minutes per address.
- **Generate after the first score ignores played games.** "Regenerate the rest" is the action that keeps them; publish refuses a draft that would move a scored game.
- **Not built:** umpires, rosters, registration, payments, live scoring, double elimination, an editor for points and forfeit settings.
