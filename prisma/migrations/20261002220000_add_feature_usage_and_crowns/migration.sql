-- CreateTable
CREATE TABLE "FeatureUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeatureUsage_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "CrownTransactionType" AS ENUM ('EARN', 'SPEND', 'ADJUSTMENT', 'REFUND');

-- CreateTable
CREATE TABLE "CrownTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CrownTransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrownTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeatureUsage_userId_feature_periodKey_key" ON "FeatureUsage"("userId", "feature", "periodKey");

-- CreateIndex
CREATE INDEX "FeatureUsage_userId_feature_idx" ON "FeatureUsage"("userId", "feature");

-- CreateIndex
CREATE UNIQUE INDEX "CrownTransaction_userId_idempotencyKey_key" ON "CrownTransaction"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "CrownTransaction_userId_createdAt_idx" ON "CrownTransaction"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "FeatureUsage" ADD CONSTRAINT "FeatureUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrownTransaction" ADD CONSTRAINT "CrownTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
