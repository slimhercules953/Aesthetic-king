-- CreateTable
CREATE TABLE "DiscordOAuthCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordOAuthCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordOAuthCredential_userId_key" ON "DiscordOAuthCredential"("userId");

-- CreateIndex
CREATE INDEX "DiscordOAuthCredential_expiresAt_idx" ON "DiscordOAuthCredential"("expiresAt");

-- AddForeignKey
ALTER TABLE "DiscordOAuthCredential" ADD CONSTRAINT "DiscordOAuthCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
