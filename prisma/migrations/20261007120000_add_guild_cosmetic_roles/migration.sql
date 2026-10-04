-- CreateTable
CREATE TABLE "GuildCosmeticRole" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildCosmeticRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuildCosmeticRole_guildId_discordRoleId_key" ON "GuildCosmeticRole"("guildId", "discordRoleId");

-- CreateIndex
CREATE INDEX "GuildCosmeticRole_guildId_idx" ON "GuildCosmeticRole"("guildId");

-- AddForeignKey
ALTER TABLE "GuildCosmeticRole" ADD CONSTRAINT "GuildCosmeticRole_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
