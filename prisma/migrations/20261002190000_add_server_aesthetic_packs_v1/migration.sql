CREATE TABLE "AestheticPack" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "aestheticId" TEXT,
    "moodId" TEXT,
    "colors" TEXT[],
    "symbols" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AestheticPack_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "GuildSettings"
ADD COLUMN "defaultPackId" TEXT;

CREATE UNIQUE INDEX "AestheticPack_guildId_name_key"
ON "AestheticPack"("guildId", "name");

CREATE INDEX "AestheticPack_guildId_idx"
ON "AestheticPack"("guildId");

CREATE INDEX "AestheticPack_enabled_idx"
ON "AestheticPack"("enabled");

CREATE INDEX "GuildSettings_defaultPackId_idx"
ON "GuildSettings"("defaultPackId");

ALTER TABLE "AestheticPack"
ADD CONSTRAINT "AestheticPack_guildId_fkey"
FOREIGN KEY ("guildId")
REFERENCES "Guild"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "GuildSettings"
ADD CONSTRAINT "GuildSettings_defaultPackId_fkey"
FOREIGN KEY ("defaultPackId")
REFERENCES "AestheticPack"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
