-- L-036 (WD-01, D-52): a team that withdrew mid-season. Its unplayed games are forfeit rows in "GameResult"; nothing else is stored.
ALTER TABLE "Team" ADD COLUMN "withdrawnAt" TIMESTAMPTZ(6);
