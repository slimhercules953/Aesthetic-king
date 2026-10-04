-- New: in-app notices surfaced by the bell in the topbar.

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'PROFILE_UPDATED', 'PREMIUM_GRANTED', 'PREMIUM_REVOKED', 'PREMIUM_EXPIRING', 'BOT_UPDATE', 'VOTE', 'SERVER');

-- AlterTable
-- Setup checklist progress is stored separately from the values it
-- describes so that clearing a value does not re-open a finished step.
ALTER TABLE "GuildSettings" ADD COLUMN     "setupGenerationDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "setupPackDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "setupAestheticDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "setupMoodDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "setupAccessDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "setupAppearanceDone" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: any server that already has a value configured has already
-- completed that step, so the checklist should show it as done.
UPDATE "GuildSettings" SET
  "setupGenerationDone" = "generationChannelId" IS NOT NULL,
  "setupPackDone"       = "defaultPackId"        IS NOT NULL,
  "setupAestheticDone"  = "defaultAestheticId"   IS NOT NULL,
  "setupMoodDone"       = "defaultMoodId"        IS NOT NULL;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "icon" TEXT,
    "readAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
