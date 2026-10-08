-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('setup', 'active', 'closed');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('open', 'closed', 'makeup');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('draft', 'published', 'superseded');

-- CreateEnum
CREATE TYPE "Side" AS ENUM ('home', 'away');

-- CreateEnum
CREATE TYPE "BracketSide" AS ENUM ('a', 'b');

-- CreateTable
CREATE TABLE "Season" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "firstDay" CHAR(10) NOT NULL,
    "lastDay" CHAR(10) NOT NULL,
    "gameMinutes" INTEGER NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'setup',
    "rules" JSONB NOT NULL,
    "standingsConfig" JSONB NOT NULL,
    "standingsConfigVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Division" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "legs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "divisionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotPattern" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "start" CHAR(5) NOT NULL,
    "fieldId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldSlot" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "day" CHAR(10) NOT NULL,
    "start" CHAR(5) NOT NULL,
    "fieldId" UUID NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Blackout" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "day" CHAR(10) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Blackout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "divisionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "leg" INTEGER NOT NULL,
    "homeTeamId" UUID NOT NULL,
    "awayTeamId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pin" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "fieldSlotId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleVersion" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "seed" BIGINT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'draft',
    "report" JSONB NOT NULL,
    "iterations" INTEGER NOT NULL,
    "accepted" INTEGER NOT NULL,
    "reason" TEXT,
    "createdBy" UUID NOT NULL,
    "publishedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScheduleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "seasonId" UUID NOT NULL,
    "scheduleVersionId" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "fieldSlotId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameResult" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "homeRuns" INTEGER NOT NULL,
    "awayRuns" INTEGER NOT NULL,
    "forfeit" "Side",
    "supersedesId" UUID,
    "reason" TEXT,
    "enteredBy" UUID NOT NULL,
    "enteredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TieResolution" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "divisionId" UUID NOT NULL,
    "teamIds" JSONB NOT NULL,
    "method" TEXT NOT NULL,
    "decidedBy" UUID NOT NULL,
    "decidedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TieResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bracket" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "divisionId" UUID NOT NULL,
    "size" INTEGER NOT NULL,
    "seeding" JSONB NOT NULL,
    "standingsFingerprint" TEXT NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BracketGame" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "bracketId" UUID NOT NULL,
    "matchId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "aTeamId" UUID,
    "bTeamId" UUID,
    "aRuns" INTEGER,
    "bRuns" INTEGER,
    "forfeit" "BracketSide",
    "winnerTeamId" UUID,
    "fieldSlotId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BracketGame_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Season_orgId_idx" ON "Season"("orgId");

-- CreateIndex
CREATE INDEX "Division_orgId_idx" ON "Division"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Division_seasonId_name_key" ON "Division"("seasonId", "name");

-- CreateIndex
CREATE INDEX "Team_divisionId_idx" ON "Team"("divisionId");

-- CreateIndex
CREATE INDEX "Team_orgId_idx" ON "Team"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_seasonId_name_key" ON "Team"("seasonId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Field_orgId_name_key" ON "Field"("orgId", "name");

-- CreateIndex
CREATE INDEX "SlotPattern_fieldId_idx" ON "SlotPattern"("fieldId");

-- CreateIndex
CREATE INDEX "SlotPattern_orgId_idx" ON "SlotPattern"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotPattern_seasonId_weekday_start_fieldId_key" ON "SlotPattern"("seasonId", "weekday", "start", "fieldId");

-- CreateIndex
CREATE INDEX "FieldSlot_fieldId_idx" ON "FieldSlot"("fieldId");

-- CreateIndex
CREATE INDEX "FieldSlot_orgId_idx" ON "FieldSlot"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldSlot_seasonId_day_start_fieldId_key" ON "FieldSlot"("seasonId", "day", "start", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldSlot_id_seasonId_key" ON "FieldSlot"("id", "seasonId");

-- CreateIndex
CREATE INDEX "Blackout_orgId_idx" ON "Blackout"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Blackout_teamId_day_key" ON "Blackout"("teamId", "day");

-- CreateIndex
CREATE INDEX "Game_divisionId_idx" ON "Game"("divisionId");

-- CreateIndex
CREATE INDEX "Game_homeTeamId_idx" ON "Game"("homeTeamId");

-- CreateIndex
CREATE INDEX "Game_awayTeamId_idx" ON "Game"("awayTeamId");

-- CreateIndex
CREATE INDEX "Game_orgId_idx" ON "Game"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Game_seasonId_key_key" ON "Game"("seasonId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Game_id_seasonId_key" ON "Game"("id", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "Pin_gameId_key" ON "Pin"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Pin_fieldSlotId_key" ON "Pin"("fieldSlotId");

-- CreateIndex
CREATE INDEX "Pin_seasonId_idx" ON "Pin"("seasonId");

-- CreateIndex
CREATE INDEX "Pin_orgId_idx" ON "Pin"("orgId");

-- CreateIndex
CREATE INDEX "ScheduleVersion_orgId_idx" ON "ScheduleVersion"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleVersion_seasonId_number_key" ON "ScheduleVersion"("seasonId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleVersion_id_seasonId_key" ON "ScheduleVersion"("id", "seasonId");

-- CreateIndex
CREATE INDEX "Placement_gameId_idx" ON "Placement"("gameId");

-- CreateIndex
CREATE INDEX "Placement_fieldSlotId_idx" ON "Placement"("fieldSlotId");

-- CreateIndex
CREATE INDEX "Placement_seasonId_idx" ON "Placement"("seasonId");

-- CreateIndex
CREATE INDEX "Placement_orgId_idx" ON "Placement"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_scheduleVersionId_gameId_key" ON "Placement"("scheduleVersionId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "Placement_scheduleVersionId_fieldSlotId_key" ON "Placement"("scheduleVersionId", "fieldSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "GameResult_supersedesId_key" ON "GameResult"("supersedesId");

-- CreateIndex
CREATE INDEX "GameResult_gameId_idx" ON "GameResult"("gameId");

-- CreateIndex
CREATE INDEX "GameResult_orgId_idx" ON "GameResult"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "GameResult_id_gameId_key" ON "GameResult"("id", "gameId");

-- CreateIndex
CREATE INDEX "TieResolution_divisionId_decidedAt_idx" ON "TieResolution"("divisionId", "decidedAt");

-- CreateIndex
CREATE INDEX "TieResolution_orgId_idx" ON "TieResolution"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Bracket_divisionId_key" ON "Bracket"("divisionId");

-- CreateIndex
CREATE INDEX "Bracket_orgId_idx" ON "Bracket"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "BracketGame_fieldSlotId_key" ON "BracketGame"("fieldSlotId");

-- CreateIndex
CREATE INDEX "BracketGame_orgId_idx" ON "BracketGame"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "BracketGame_bracketId_matchId_key" ON "BracketGame"("bracketId", "matchId");

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Division" ADD CONSTRAINT "Division_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Division" ADD CONSTRAINT "Division_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Field" ADD CONSTRAINT "Field_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotPattern" ADD CONSTRAINT "SlotPattern_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotPattern" ADD CONSTRAINT "SlotPattern_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotPattern" ADD CONSTRAINT "SlotPattern_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldSlot" ADD CONSTRAINT "FieldSlot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldSlot" ADD CONSTRAINT "FieldSlot_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldSlot" ADD CONSTRAINT "FieldSlot_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_gameId_seasonId_fkey" FOREIGN KEY ("gameId", "seasonId") REFERENCES "Game"("id", "seasonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pin" ADD CONSTRAINT "Pin_fieldSlotId_seasonId_fkey" FOREIGN KEY ("fieldSlotId", "seasonId") REFERENCES "FieldSlot"("id", "seasonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_scheduleVersionId_seasonId_fkey" FOREIGN KEY ("scheduleVersionId", "seasonId") REFERENCES "ScheduleVersion"("id", "seasonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_gameId_seasonId_fkey" FOREIGN KEY ("gameId", "seasonId") REFERENCES "Game"("id", "seasonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_fieldSlotId_seasonId_fkey" FOREIGN KEY ("fieldSlotId", "seasonId") REFERENCES "FieldSlot"("id", "seasonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_supersedesId_gameId_fkey" FOREIGN KEY ("supersedesId", "gameId") REFERENCES "GameResult"("id", "gameId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TieResolution" ADD CONSTRAINT "TieResolution_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TieResolution" ADD CONSTRAINT "TieResolution_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bracket" ADD CONSTRAINT "Bracket_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bracket" ADD CONSTRAINT "Bracket_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketGame" ADD CONSTRAINT "BracketGame_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketGame" ADD CONSTRAINT "BracketGame_bracketId_fkey" FOREIGN KEY ("bracketId") REFERENCES "Bracket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketGame" ADD CONSTRAINT "BracketGame_aTeamId_fkey" FOREIGN KEY ("aTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketGame" ADD CONSTRAINT "BracketGame_bTeamId_fkey" FOREIGN KEY ("bTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketGame" ADD CONSTRAINT "BracketGame_winnerTeamId_fkey" FOREIGN KEY ("winnerTeamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BracketGame" ADD CONSTRAINT "BracketGame_fieldSlotId_fkey" FOREIGN KEY ("fieldSlotId") REFERENCES "FieldSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ───────────── Hand-written from here: what Prisma cannot express ─────────────

-- D-10: one published version per season. Publishing supersedes the old version first, then publishes
-- the new one, in one transaction; a concurrent second publish is refused here.
CREATE UNIQUE INDEX "ScheduleVersion_one_published_per_season"
  ON "ScheduleVersion"("seasonId") WHERE "status" = 'published';

-- D-13: one original result per game. With the unique index on "supersedesId" and the same-game FK,
-- a game's results form one linear chain, so exactly one of them is current.
CREATE UNIQUE INDEX "GameResult_one_original_per_game"
  ON "GameResult"("gameId") WHERE "supersedesId" IS NULL;

-- D-13: GameResult and TieResolution are append-only. A direct UPDATE or DELETE is refused. A DELETE
-- arriving through a foreign-key cascade (deleting the org or the season) is let through: it runs inside
-- the referential-integrity trigger, so pg_trigger_depth() is 2 there and 1 for a direct statement.
-- TRUNCATE is left alone (row triggers do not fire on it), so tests can still empty the tables.
CREATE FUNCTION league_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN RETURN OLD; END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "GameResult_append_only"
  BEFORE UPDATE OR DELETE ON "GameResult"
  FOR EACH ROW EXECUTE FUNCTION league_append_only();

CREATE TRIGGER "TieResolution_append_only"
  BEFORE UPDATE OR DELETE ON "TieResolution"
  FOR EACH ROW EXECUTE FUNCTION league_append_only();

-- D-6: CHAR(n) pads a short value instead of refusing it, so the shape is checked.
ALTER TABLE "Season"
  ADD CONSTRAINT "Season_firstDay_shape" CHECK ("firstDay" ~ '^\d{4}-\d{2}-\d{2}$'),
  ADD CONSTRAINT "Season_lastDay_shape" CHECK ("lastDay" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "FieldSlot"
  ADD CONSTRAINT "FieldSlot_day_shape" CHECK ("day" ~ '^\d{4}-\d{2}-\d{2}$'),
  ADD CONSTRAINT "FieldSlot_start_shape" CHECK ("start" ~ '^\d{2}:\d{2}$');
ALTER TABLE "Blackout" ADD CONSTRAINT "Blackout_day_shape" CHECK ("day" ~ '^\d{4}-\d{2}-\d{2}$');
ALTER TABLE "SlotPattern"
  ADD CONSTRAINT "SlotPattern_start_shape" CHECK ("start" ~ '^\d{2}:\d{2}$'),
  ADD CONSTRAINT "SlotPattern_weekday_range" CHECK ("weekday" BETWEEN 0 AND 6);

ALTER TABLE "Division" ADD CONSTRAINT "Division_legs_range" CHECK ("legs" IN (1, 2));
ALTER TABLE "Game"
  ADD CONSTRAINT "Game_leg_range" CHECK ("leg" IN (1, 2)),
  ADD CONSTRAINT "Game_two_teams" CHECK ("homeTeamId" <> "awayTeamId");
ALTER TABLE "GameResult" ADD CONSTRAINT "GameResult_runs_nonnegative" CHECK ("homeRuns" >= 0 AND "awayRuns" >= 0);
ALTER TABLE "ScheduleVersion" ADD CONSTRAINT "ScheduleVersion_seed_uint32" CHECK ("seed" BETWEEN 0 AND 4294967295);
