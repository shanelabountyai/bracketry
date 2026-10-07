# Bracketry write-up

Working notes, filled in per item and finished at L-022.

- **L-002:** guard rails make the engine's purity (D-3) a lint error rather than a convention, and `pending:check` makes "red for the right reason" (D-20) a number: 133 of 138 pending tests fail with NotImplementedError, 5 fail on their assertion.
- **L-003:** the round robin is checked for every size from 2 to 16 rather than assumed complete: every pair once (twice in a double), nobody twice in a round, byes spread one per team, home/away within 1 (exactly 0 in a double).
