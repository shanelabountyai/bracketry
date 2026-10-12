# NEXT

PICK UP HERE: L-016, standings page (**Sonnet** per the backlog). Read STAND-01 to STAND-06 in 00-master-prd.md, D-13, D-14, D-22. Table with reasons, tiebreak chain editor (reorder, restart or continue, logged change after the first game), unresolved-tie flag, commissioner decision form (append-only `TieResolution`). Standings are computed on read from `GameResult` (latest non-superseded row per game) through the engine in `src/lib/league/`; names replace the team ids in `StandingsRow.note` here (D-22).

Done at L-015: `recordResult` in `src/app/o/[org]/seasons/result-actions.ts`; history is a game's `GameResult` chain ordered by `enteredAt`; the newest row is the one nothing supersedes (`supersededBy: { none: {} }`). Forfeit rows store 0-0.

Needs the owner: D-23 (the caller keeps past open slots out of the reschedule inventory) was a default at L-010. Confirm or replace it before L-017. D-27 and D-30: commissioners do setup and scores; the scorekeeper permission needs a template edit whenever you want it.

Open from L-009: no function clears a bracket result, and the spec's correction rule asks for one. That and the D-15 fingerprint check land at L-018.

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-021's seed data defines the same league, make one source for both.

Open from L-014: a pin whose slot is closed later is not dropped; it shows as a hard violation at the next generation (L-017's rainout tool should offer to remove such pins).
