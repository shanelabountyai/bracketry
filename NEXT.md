# NEXT

PICK UP HERE: L-017, rainout tool (**Opus** per the backlog). Read RAIN-01 to RAIN-05 in 00-master-prd.md, D-12, D-18, and the L-009 reschedule notes in PROGRESS. Close a day or slots, add makeup slots, show displaced games, propose a draft version, publish, queue a notice per affected team. "Regenerate the rest" is a separate action with its warning. Only displaced games move (D-12).

Done at L-016: standings on read in `seasons/standings-load.ts`; `saveChain` and `recordTie` in `seasons/standings-actions.ts`; page at `seasons/[season]/standings`. A chain change is an audit row (`season.tiebreak_changed`) plus a `standingsConfigVersion` bump.

Needs the owner: D-27 and D-30: commissioners do setup and scores; the scorekeeper permission needs a template edit whenever you want it.

Open from L-009: no function clears a bracket result, and the spec's correction rule asks for one. That and the D-15 fingerprint check land at L-018.

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-021's seed data defines the same league, make one source for both.

Open from L-014: a pin whose slot is closed later is not dropped; it shows as a hard violation at the next generation (L-017's rainout tool should offer to remove such pins).

Open from L-016: no editor for points, run-diff cap or forfeit settings (STAND-02); add one if a later item needs it.
