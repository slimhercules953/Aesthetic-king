CREATE TABLE "GuildCommandSetting" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "commandName" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildCommandSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GuildCommandSetting_guildId_commandName_key"
ON "GuildCommandSetting"("guildId", "commandName");

CREATE INDEX "GuildCommandSetting_guildId_idx"
ON "GuildCommandSetting"("guildId");

ALTER TABLE "GuildCommandSetting"
ADD CONSTRAINT "GuildCommandSetting_guildId_fkey"
FOREIGN KEY ("guildId")
REFERENCES "Guild"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
