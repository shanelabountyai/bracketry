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

## 8. What-if and the points range (L-023)

**What-if (WHATIF-01)** is `computeStandings` called with the played results plus the hypothetical ones. There is no second table function.

**Points range (WHATIF-02).** `pointsRankRange(teams, results, unplayed, config)` tries every outcome of the unplayed games among `teams` (home win, tie, away win: 3 to the power of the games left) and returns, per team, on **points alone**:

- `bestRank`: 1 + the fewest teams strictly ahead of it in any outcome.
- `worstRank`: 1 + the most teams level with it or ahead in any outcome.

Tiebreakers are not applied, so a team level on points is assumed to lose the tie for `worstRank` and win it for `bestRank`. With a cut of N teams: **clinched** when `worstRank ≤ N`, **eliminated** when `bestRank > N`. Both are therefore conservative: a team that would clinch only through a tiebreaker is not flagged.

Above `ENUMERATION_LIMIT` (12) unplayed games the function returns null and the page shows no flags. 3^12 is 531,441 outcomes.

**WI-1.** W 2, T 1, L 0. Played: A beat B, C and D (A 6); B beat C (B 2, C 0, D 0). Unplayed: B–D and C–D.

| Team | Points, low to high | Best case | Worst case | Range |
|---|---|---|---|---|
| A | 6 | nobody can pass 4 | the same | 1 to 1 |
| B | 2 to 4 | only A ahead | loses to D, C beats D: A ahead, C and D level on 2 | 2 to 4 |
| C | 0 to 2 | D beats B, C beats D: B, C, D all on 2, only A ahead | loses: everyone is on 0 or more | 2 to 4 |
| D | 0 to 4 | wins both: D 4, B 2, only A ahead | loses both: everyone is on 0 or more | 2 to 4 |

Cut of 1: A has clinched; B, C and D are eliminated. Cut of 2: A has clinched; nobody else is flagged either way.

## 9. Crossover results (L-026, D-40)

`StandingsConfig.countCrossover` is off by default, and then §1 stands unchanged: a result naming a team outside the list is dropped for both sides (D-22).

With it on:

- **The table (§1)** counts such a result for the team that is in the list: played, win, loss or tie, points, runs for and against, and capped differential. The outside team gets no row.
- **'all'-scope steps** read that same table, so crossover runs count in overall run differential and runs allowed.
- **'tied'-scope steps** are unchanged. Their table is built from the games among the tied teams only, and a crossover opponent is never one of them. `balanced` is unchanged for the same reason.
- **Points range (§8)** takes an unplayed game with one team in the list as a game that moves that team alone (win, tie or loss points), and it counts toward `ENUMERATION_LIMIT`.

The season loader turns it on for every division. It is passed at the call and is not stored with the chain.

**CX-1.** Teams A, B. Results: A 3–1 B; Z 9–0 A (Z is outside). W 2, T 1, L 0, cap 7.

| Team | P | W | L | Pts | RF | RA | Diff |
|---|---|---|---|---|---|---|---|
| A | 2 | 1 | 1 | 2 | 3 | 10 | +2 and −7 (capped from −9) = −5 |
| B | 1 | 0 | 1 | 0 | 1 | 3 | −2 |

**CX-2.** Teams A, B. A 3–1 B; B 5–0 Z; Z 2–1 A. A and B both have 2 points. Head-to-head among the tied teams is the one game A–B: A 2, B 0. A is 1st via head-to-head. B's crossover win is not in that table.

**CX-3.** Teams A, B. Played: B beat Z and B beat Y, so B has 4. Unplayed: A at home to Z. A ends on 0, 1 or 2, always behind B: A is 2 to 2 and B is 1 to 1. With the flag off all three games are dropped, both teams have 0, and each is 1 to 2.

## 10. A withdrawn team (L-036, D-52)

No new function and no new setting. Two rules that already exist carry it:

- **Its unplayed games are forfeits by the withdrawn team (§1).** One result row per game, whatever the game's date. Results it played before it withdrew stand as entered.
- **It is left out of `teams` (§9).** The loader passes the division's teams without the withdrawn one, with `countCrossover` on as it always is. So every other team's games against it count, played and forfeited alike; the withdrawn team has no row, no rank, no points range and is never seeded; 'tied'-scope steps and `balanced` never see it.

The screen lists a withdrawn team under its division's table with its own played, won, lost, tied and points: the §1 tally of that one team, taken on its own. That line is not a rank.

A bracket seeded before the withdrawal keeps its frozen seeds (D-15). The standings fingerprint changes, so the existing warning shows.

**WD-1.** Teams A, B, C; D withdrew and is outside the list. W 2, T 1, L 0, cap 7, forfeit score 7, `forfeitCountsInRuns` false. Results: D 5–3 A; B 4–2 D; C at home to D, forfeit by D; A 6–1 B; C 2–2 A.

| Team | P | W | L | T | Pts | RF | RA | Diff |
|---|---|---|---|---|---|---|---|---|
| A | 3 | 1 | 1 | 1 | 0 + 2 + 1 = 3 | 3 + 6 + 2 = 11 | 5 + 1 + 2 = 8 | −2 + 5 + 0 = +3 |
| B | 2 | 1 | 1 | 0 | 2 + 0 = 2 | 4 + 1 = 5 | 2 + 6 = 8 | +2 − 5 = −3 |
| C | 2 | 1 | 0 | 1 | 2 + 1 = 3 | 0 + 2 = 2 | 0 + 2 = 2 | 0 + 0 = 0 |

A and C have 3 points. Head-to-head among the two is the one game C 2–2 A: 1 point each, level. Differential in that game: 0 each, level. Overall differential: A +3, C 0. **A is 1st via `rd-all`, C 2nd, B 3rd on points.** C's forfeit win is worth its 2 points and no runs.

With `forfeitCountsInRuns` true the forfeit reads C 7–0 D: C has RF 9, RA 2, differential +7, and **C is 1st via `rd-all`, A 2nd.**

D on its own: played 3, won 1 (A), lost 2 (B, and the forfeit), 2 points.
