-- L-026 (DBL-01, D-41): rounds of crossover games between every two divisions of a season. 0 = none.
ALTER TABLE "Season" ADD COLUMN "crossoverRounds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Season" ADD CONSTRAINT "Season_crossoverRounds_range" CHECK ("crossoverRounds" BETWEEN 0 AND 16);
