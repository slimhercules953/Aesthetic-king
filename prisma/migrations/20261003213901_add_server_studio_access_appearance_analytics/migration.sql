-- DropIndex
DROP INDEX "Entitlement_skuId_idx";

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "embedColor" TEXT,
ADD COLUMN     "footerText" TEXT,
ADD COLUMN     "showGeneratedImages" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showPackBadge" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showRerollButtons" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "SharedPost" ALTER COLUMN "tags" DROP DEFAULT;

-- CreateTable
CREATE TABLE "GuildAccessRule" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "effect" TEXT NOT NULL DEFAULT 'ALLOW',
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildAccessRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildUsageEvent" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "commandName" TEXT NOT NULL,
    "component" TEXT NOT NULL DEFAULT 'command',
    "aestheticId" TEXT,
    "moodId" TEXT,
    "packId" TEXT,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GuildAccessRule_guildId_idx" ON "GuildAccessRule"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "GuildAccessRule_guildId_kind_targetId_key" ON "GuildAccessRule"("guildId", "kind", "targetId");

-- CreateIndex
CREATE INDEX "GuildUsageEvent_guildId_createdAt_idx" ON "GuildUsageEvent"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "GuildUsageEvent_guildId_commandName_idx" ON "GuildUsageEvent"("guildId", "commandName");

-- AddForeignKey
ALTER TABLE "GuildAccessRule" ADD CONSTRAINT "GuildAccessRule_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
