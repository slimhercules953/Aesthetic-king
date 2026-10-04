-- Records every payment-provider webhook the app has acted on.
--
-- Providers redeliver: any non-2xx response is retried, and the same
-- event can arrive twice even on success. The unique index on
-- (provider, externalEventId) is what lets the webhook handler claim an
-- event before applying it, so a replay cannot grant Premium twice.
--
-- The key is namespaced by provider because two providers can hand out
-- the same-shaped id independently.

-- CreateTable
CREATE TABLE "PaymentEventRecord" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "discordId" TEXT,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEventRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEventRecord_provider_externalEventId_key" ON "PaymentEventRecord"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "PaymentEventRecord_discordId_processedAt_idx" ON "PaymentEventRecord"("discordId", "processedAt");
