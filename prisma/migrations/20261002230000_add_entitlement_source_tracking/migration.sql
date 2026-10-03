-- Adds provenance columns to "Entitlement" so a real payment provider
-- can be wired in later without backfilling paying customers.
--
-- Both columns are nullable and every existing row keeps working:
-- a NULL skuId simply means "not from the store" (staff grant, trial,
-- dev grant, or a grant made before this column existed).

-- AlterTable
ALTER TABLE "Entitlement"
    ADD COLUMN "skuId" TEXT,
    ADD COLUMN "externalEntitlementId" TEXT;

-- CreateIndex
-- Postgres treats NULLs as distinct in unique indexes, so this
-- tolerates any number of manual grants while still rejecting a
-- replayed provider webhook.
CREATE UNIQUE INDEX "Entitlement_externalEntitlementId_key"
    ON "Entitlement"("externalEntitlementId");

-- CreateIndex
-- Lets refund handling find the grant for a given SKU quickly.
CREATE INDEX "Entitlement_skuId_idx"
    ON "Entitlement"("skuId");
