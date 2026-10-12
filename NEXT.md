# NEXT

PICK UP HERE: L-014, versions and publish (**Sonnet** per the backlog). Read SCHED-02 to SCHED-04 and GEN-06 in 00-master-prd.md, D-10 (one published version per season, partial unique index), D-11 and D-28. Version list, compare two versions, publish with a reason (gate: `isPublishable` on the stored report), supersede the previous published one. Pins: set one, refuse an illegal pin (score it with `scoreSchedule`, never restate a rule), regenerate around pins (add `pinned` to `buildInput` in `src/lib/league/build-input.ts`, and to `inputHash`, which already hashes it).

Watch at L-014: versions and placements are never updated; publish and supersede change only status, reason and publishedAt. Map the partial-unique violation, never check-then-write. A team added after a first generation changes later runs' pairings while stored `Game` rows keep their first home/away (D-28): decide how compare handles it before building compare. The version report on the season page (`VersionReport` in `seasons/[season]/page.tsx`) is the thing to reuse for compare.

Needs the owner: D-23 (the caller keeps past open slots out of the reschedule inventory) was taken as a default at L-010. Confirm or replace it before L-017. D-27 (setup = `org.update`) was a default at L-012; the scorekeeper permission is a template-owned edit, raised at L-015.

Open from L-008: standings notes carry team ids, not names (D-22). L-016 substitutes names.

Open from L-009: no function clears a bracket result, and the spec's correction rule asks for one. That and the D-15 fingerprint check land at L-018.

Open from L-010: the capstone season is imported from `tests/unit/league-fixtures.ts`. If L-021's seed data defines the same league, make one source for both.
