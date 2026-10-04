-- The Stripe Customer belonging to each account.
--
-- Checkout creates a customer the first time an account buys something and
-- reuses it afterwards. Without this column every checkout would create a
-- brand new customer, so one person's subscriptions, invoices and saved
-- payment methods would be scattered across a dozen Stripe customers that
-- nothing can tie together.
--
-- Unique because the mapping goes one way in both directions: a customer id
-- must never be shared between two accounts, since the webhook and any
-- future customer-portal link resolve a person through it.
--
-- Nullable with no default. An account that has never bought anything has
-- no customer, and none is created eagerly at sign-in.
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");
