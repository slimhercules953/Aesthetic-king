-- Phase 7: publishing Profile Builder profiles and server Aesthetic Packs
-- to the Discover feed.
--
-- Two new members of the existing polymorphic `SharedItemType`. `SharedPost`
-- addresses its subject with the pair (`itemType`, `itemId`) and deliberately
-- has NO foreign key to the item table -- that is what lets one table point at
-- saved aesthetics, saved palettes and catalog profile sets at once. So this
-- migration only extends the enum; there is no new table and no new column.
--
-- `ALTER TYPE ... ADD VALUE` runs inside a transaction on Postgres 12+, but
-- the new value cannot be *used* by any later statement in that same
-- transaction. Prisma wraps each migration file in one transaction, so
-- anything that filters on 'PROFILE' or 'PACK' has to live in a later
-- migration. Nothing here does.
--
-- Values are appended rather than inserted so existing rows keep their
-- on-disk sort order; nothing in the product orders by the enum.

-- Add new value to enum "SharedItemType"
ALTER TYPE "public"."SharedItemType" ADD VALUE IF NOT EXISTS 'PROFILE';

-- Add new value to enum "SharedItemType"
ALTER TYPE "public"."SharedItemType" ADD VALUE IF NOT EXISTS 'PACK';
