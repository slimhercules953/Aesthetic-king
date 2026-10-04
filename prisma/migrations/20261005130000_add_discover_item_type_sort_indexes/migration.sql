-- Indexes for the Discover feed now that it filters by item type.
--
-- Every Discover chip and every filtered search runs
--
--     WHERE sp."itemType" = $n::"SharedItemType"
--     ORDER BY sp."createdAt" DESC   -- or: "likeCount" DESC, "createdAt" DESC
--     LIMIT ... OFFSET ...
--
-- Before PROFILE and PACK landed, "All" was the only chip anyone could
-- reasonably use, so the planner could satisfy the sort with
-- "SharedPost_createdAt_idx" and throw away the few rows that missed the
-- filter. With six types, a chip like "Server packs" selects a small slice of
-- a feed ordered by time: scanning the createdAt index backwards reads most of
-- the table just to fill one page.
--
-- "SharedPost_itemType_itemId_idx" does not help here. It can locate the type,
-- but itemId is its second key, so the matching rows still come back unordered
-- by time and every page needs an explicit sort.
--
-- These two are (equality column, then the ORDER BY columns), so the scan
-- returns rows already in the requested order and LIMIT stops after one page.
-- The popular sort needs likeCount before createdAt because that is the exact
-- ORDER BY precedence; (itemType, createdAt) cannot serve it.
--
-- Declared ASC in both this file and schema.prisma even though the feed sorts
-- DESC: Postgres walks a btree backwards, so one index serves both directions,
-- and agreeing with the schema keeps `prisma migrate diff` quiet.
--
-- Plain CREATE INDEX, not CONCURRENTLY: `prisma migrate deploy` runs each
-- migration in a transaction and CONCURRENTLY cannot run inside one. The feed
-- is small enough that the brief lock does not matter, and staying
-- transactional keeps a failed migration from leaving half an index behind.

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SharedPost_itemType_createdAt_idx"
ON "SharedPost"("itemType", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SharedPost_itemType_likeCount_createdAt_idx"
ON "SharedPost"("itemType", "likeCount", "createdAt");
