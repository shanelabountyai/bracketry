# 02 — Standings and bracket spec (normative)

Covers `src/lib/league/{standings,bracket}.ts`. Fixtures are in `tests/unit/league-standings.pending.ts` and `league-bracket.pending.ts`. Each expected value was worked by hand (shown here) and checked against a throwaway reference implementation that is not in this repo.

Tiebreaker rules differ from league to league. The chain below is this product's default, chosen to be easy to explain to a coach. It is configuration, and nothing here claims to be any governing body's rule.

## 1. The table

`computeStandings(teams, results, config)` is a pure function. It returns one row per team, in rank order.

For each result, per team: played, win / loss / tie, points (`config.points`), runs for, runs against, and a **capped differential**: the game's run margin clamped to ±`runDiffCap` before it is added. A 15–0 win with a cap of 7 adds +7 for the winner and −7 for the loser.

**Forfeits.** `forfeit: 'home' | 'away'` names the side that forfeited. The entered runs are ignored; the other side wins `forfeitScore`–0. The game always counts in played, win/loss and points. It counts in runs for, runs against and differential only when `forfeitCountsInRuns` is true (default false).

Results naming a team that is not in `teams` are ignored. The output does not depend on the order of `teams` or `results`.

## 2. Breaking ties

Teams are grouped by points, highest first. A group of one is ranked `decidedBy: 'points'`. A larger group goes through the chain:

```
resolve(group, step):
  if the group has one team: done
  if step is past the end of the chain:
      if a manual resolution lists exactly these teams: use its order, decidedBy 'manual'
      else: the teams share a rank, decidedBy 'unresolved', needsManualResolution true
  let s = chain[step]
  if s.scope is 'tied' and the group is not balanced: resolve(group, step + 1)
  compute s.metric for each team (within s.scope)
  if every team has the same value: resolve(group, step + 1)
  otherwise split the group by value, best first; for each part:
      one team:        ranked here, decidedBy s.id
      several teams:   resolve(part, 0)          when onPartialBreak is 'restart'
                       resolve(part, step + 1)   when onPartialBreak is 'continue'
```

**Scope.** `'tied'` means the metric is computed only from games where both teams are in the current group. `'all'` means every game.

**Balanced.** A group is balanced when every pair of teams in it has played each other, and every pair the same number of times. Until then a tied-scope step would reward whoever happened to have played, so it is skipped (STAND-06).

**Metrics.** `h2hPoints`: points. `runDiff`: capped differential. `runsAllowed`: fewer is better. `runsScored`, `wins`: more is better. Forfeits follow §1 for the run-based metrics.

**Restart or continue.** Restart is the default: once a step has separated some teams, the teams still tied start again from the first step, among themselves only. It always terminates because the group has shrunk. Fixture ST-3 gives a different order under each setting.

**Default chain.**

| # | id | Metric | Scope |
|---|---|---|---|
| 1 | `h2h` | head-to-head points | tied |
| 2 | `rd-tied` | capped run differential | tied |
| 3 | `rd-all` | capped run differential | all |
| 4 | `ra-all` | runs allowed | all |

## 3. Ranks, reasons and unresolved ties

- Ranks are 1-based. `k` teams sharing rank `p` are followed by rank `p + k`. Teams sharing a rank are listed in team id order.
- `decidedBy` is `'points'`, the id of the step that set the team apart, `'manual'` or `'unresolved'`.
- `note` is a sentence starting with the ordinal rank that names the step and the teams it separated the row from: "1st via head-to-head over B". The suite checks that an `h2h` row's note contains "head-to-head" and the other team's name.
- The system never breaks a tie at random. `manualResolutions` is the list of logged commissioner decisions; an entry applies only when it lists exactly the teams of an unresolved group (STAND-05).

## 4. Worked fixtures

Defaults unless stated: win 2, tie 1, loss 0, cap 7, restart. "A 5–1 B" means A at home won 5–1.

**ST-1, no ties.** A 3–1 B, A 2–0 C, B 4–3 C. Points A 4, B 2, C 0. A: played 2, runs 5–1, differential +4.

**ST-2, head-to-head before differential.** A 3–2 B, A 4–0 C, D 5–1 A, B 6–1 C, B 2–1 D, C 3–2 D.
Points: A 4 (beat B, C), B 4 (beat C, D), C 2 (beat D), D 2 (beat A).
Differential: A +1 +4 −4 = +1. B −1 +5 +1 = +5. C −4 −5 +1 = −8. D +4 −1 −1 = +2.
A and B are tied; A beat B, so A is first although B's differential is better. C and D are tied; C beat D, so C is third although D's differential is better. Order A, B, C, D, all `h2h`.

**ST-3, the three-way circle.** A 5–1 B, B 4–1 C, C 3–1 A, A 6–2 D, B 2–1 D, C 9–0 D.
A, B and C have 4 points each; D has 0. Among the three, each has one win: head-to-head is level at 2 points each.
Differential among the three: A +4 −2 = **+2**. B −4 +3 = **−1**. C −3 +2 = **−1**. A is first (`rd-tied`). B and C are still tied.
- *Restart:* B and C go back to head-to-head. B beat C. Order **A, B, C, D**; B and C are `h2h`.
- *Continue:* B and C go on to overall differential. B: −4 +3 +1 = 0. C: −3 +2 +7 = +6 (the 9–0 win is capped at 7). Order **A, C, B, D**; C and B are `rd-all`.
Overall capped differentials: A +6, B 0, C +6, D −12.

**ST-4, cap, skipped steps, and a tie nothing breaks.** A 15–0 B, C 8–0 D. Nothing else played.
A and C have 2 points and have not met: both tied-scope steps are skipped. Overall capped differential: A +7 (from 15), C +7 (from 8). Runs allowed: 0 and 0. Chain exhausted: A and C **share rank 1**, flagged.
B and D have 0 points and have not met. Differential −7 each. Runs allowed: B 15, D 8. D is ahead (`ra-all`). Order: A (1), C (1), D (3), B (4).

**ST-5, a commissioner decision.** ST-4 with `manualResolutions: [['C', 'A']]`: C 1st, A 2nd, both `manual`, nothing flagged.

**ST-6, forfeit.** B forfeits at A. Default: A has a win and 2 points, runs 0–0, differential 0. With `forfeitCountsInRuns`: A runs 7–0, differential +7; B −7.

**ST-7, a tied game.** A 4–4 B, A 2–1 C. A: 1 win, 1 tie, 3 points. B: 1 tie, 1 point. C: 0.

**ST-8, mid-season.** A 1–0 B, B 2–1 D, C 10–0 D. A, B and C have 2 points. Among them only A–B has been played, so the group is not balanced and both tied-scope steps are skipped. Overall differential: C +7, A +1, B −1 +1 = 0. Order C, A, B, D. Applied naively, head-to-head would have put A first.

**ST-9, no games.** Every team shares rank 1, `unresolved`, with 0 played.

## 5. Seeding order

`seedOrder(size)` gives seed numbers in bracket position order for a power-of-two size:

```
order(2)  = [1, 2]
order(2k) = for each s in order(k): s, then 2k + 1 − s
```

| Size | Order |
|---|---|
| 4 | 1, 4, 2, 3 |
| 8 | 1, 8, 4, 5, 2, 7, 3, 6 |
| 16 | 1, 16, 8, 9, 4, 13, 5, 12, 2, 15, 7, 10, 3, 14, 6, 11 |

Consecutive entries are a first-round pair, and each pair sums to `size + 1`. Seeds 1 and 2 are in opposite halves; if the better seed always wins, round 2 of an 8-team bracket is 1 v 4 and 2 v 3. Any other size is refused.

## 6. Building a bracket

`buildBracket(teams)` takes the teams in seed order, best first. `size` is the smallest power of two that holds them. Seed numbers above the team count are byes, so byes always fall to the top seeds.

- Match ids are `R{round}M{index}`, both from 1. The winner of `R{r}M{i}` goes to `R{r+1}M{ceil(i/2)}`, side `a` when `i` is odd, `b` when even. The final's `winnerTo` is null.
- In round 1, side `a` is the first seed of the pair. A team slot carries its seed.
- A round-1 match with a bye has its winner set at build time and no result, and that team already sits in its round-2 slot.

| Teams | Round 1 | Round 2 at build time |
|---|---|---|
| 8 | 1v8, 4v5, 2v7, 3v6 | winners of M1 v M2, M3 v M4 |
| 6 | 1 v bye, 4v5, 2 v bye, 3v6 | 1 v winner M2, 2 v winner M4 |
| 12 | 1 bye, 8v9, 4 bye, 5v12, 2 bye, 7v10, 3 bye, 6v11 | 1 v winner M2, 4 v winner M4, 2 v winner M6, 3 v winner M8 |
| 5 | 1 bye, 4v5, 2 bye, 3 bye | 1 v winner M2, 2 v 3 |
| 2 | 1v2 | — |

Fewer than 2 teams, or a duplicate team, is refused.

**Home team.** The better seed (lower number) is home in any match (BRKT-02). Sides `a` and `b` are positions in the tree, not home and away; the app derives home from the seeds.

## 7. Recording results

`recordResult(bracket, matchId, result)` returns a new bracket; the one passed in is unchanged.

- Both slots must hold teams. A match still waiting on an earlier game, a bye match, and an unknown match id are refused.
- Equal runs with no forfeit is refused. `forfeit: 'a' | 'b'` names the side that forfeited; the other side advances whatever the runs say.
- The winner is written to `winner` and into its slot in the next match, with its original seed.
- **Corrections.** Recording again on a match replaces its result and its winner in the next match, as long as the next match has no result. Once the next match has been played the correction is refused; the later result has to be cleared first (BRKT-05).

`champion(bracket)` is the final's winner, or null.
