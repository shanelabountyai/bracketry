# Bracketry write-up

Working notes, filled in per item and finished at L-022.

- **L-002:** guard rails make the engine's purity (D-3) a lint error rather than a convention, and `pending:check` makes "red for the right reason" (D-20) a number: 133 of 138 pending tests fail with NotImplementedError, 5 fail on their assertion.
- **L-004:** feasibility reports necessary conditions only and says so: a pass reads "these inputs could fit", and each shortfall is a sentence with its numbers (9 teams over 4 weeks: 36 games, 32 slots, 4 short).
- **L-003:** the round robin is checked for every size from 2 to 16 rather than assumed complete: every pair once (twice in a double), nobody twice in a round, byes spread one per team, home/away within 1 (exactly 0 in a double).
- **L-005:** one function judges every schedule (D-4), and its counting was agreed in plain words before it was coded. The deliberately bad fixture scores exactly what the spec's hand arithmetic says: 6 hard, 31 soft, one game unplaced. The one gap the spec left, a pinned game that is not placed at all, was settled as "unplaced, not a pin violation" (D-21).
