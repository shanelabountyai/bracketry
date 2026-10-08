# Bracketry write-up

Working notes, filled in per item and finished at L-022.

- **L-002:** guard rails make the engine's purity (D-3) a lint error rather than a convention, and `pending:check` makes "red for the right reason" (D-20) a number: 133 of 138 pending tests fail with NotImplementedError, 5 fail on their assertion.
- **L-004:** feasibility reports necessary conditions only and says so: a pass reads "these inputs could fit", and each shortfall is a sentence with its numbers (9 teams over 4 weeks: 36 games, 32 slots, 4 short).
- **L-003:** the round robin is checked for every size from 2 to 16 rather than assumed complete: every pair once (twice in a double), nobody twice in a round, byes spread one per team, home/away within 1 (exactly 0 in a double).
- **L-005:** one function judges every schedule (D-4), and its counting was agreed in plain words before it was coded. The deliberately bad fixture scores exactly what the spec's hand arithmetic says: 6 hard, 31 soft, one game unplaced. The one gap the spec left, a pinned game that is not placed at all, was settled as "unplaced, not a pin violation" (D-21).
- **L-006:** the generator is a greedy draft plus a seeded local search, and it reports its work rather than claiming a best answer (D-5). On the 9-team capstone the draft scores 320 and the search finishes at 114 at seed 2027 (2,508 iterations, 22 accepted moves, 281 ms), against a floor of 100 that can be shown by counting. Seeds 1, 2 and 3 finish at 110, 102 and 120; none reaches the floor. The move set and how order is kept deterministic were agreed before the loop was written, and a test shows that reordering the inputs does not change the schedule.
