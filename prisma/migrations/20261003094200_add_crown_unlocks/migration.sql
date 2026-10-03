-- CreateEnum
CREATE TYPE "CrownUnlockKind" AS ENUM ('BOOST', 'TIMED');

-- CreateTable
CREATE TABLE "CrownUnlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "kind" "CrownUnlockKind" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "allowance" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrownUnlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrownUnlock_userId_feature_periodKey_key" ON "CrownUnlock"("userId", "feature", "periodKey");

-- CreateIndex
CREATE INDEX "CrownUnlock_userId_feature_idx" ON "CrownUnlock"("userId", "feature");

-- CreateIndex
CREATE INDEX "CrownUnlock_userId_expiresAt_idx" ON "CrownUnlock"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "CrownUnlock" ADD CONSTRAINT "CrownUnlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
