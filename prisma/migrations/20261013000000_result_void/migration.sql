-- L-031 (SCORE-14, D-45): a void is a superseding row, never a delete (D-13). The game then has no score.
ALTER TABLE "GameResult" ADD COLUMN "voided" BOOLEAN NOT NULL DEFAULT false;
-- A void carries no score, names the row it voids and says why.
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_void_shape" CHECK (
  NOT "voided" OR ("supersedesId" IS NOT NULL AND "reason" IS NOT NULL AND "homeRuns" = 0 AND "awayRuns" = 0 AND "forfeit" IS NULL)
);
