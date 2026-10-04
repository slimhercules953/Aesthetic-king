-- Phase 7 (Community) — remixing with attribution, part 2.
--
-- The bell needs a type for "someone remixed your work". `NotificationType`
-- is a Postgres enum, so adding a member is DDL rather than just a new string
-- in TypeScript — Prisma will not add it from the schema alone.
--
-- Appending is safe: enum members are compared by name and nothing sorts by
-- the enum's internal OID, so this cannot reorder existing rows.
--
-- It has to be its own migration. `ALTER TYPE ... ADD VALUE` cannot run
-- inside a transaction block on older Postgres, and `migrate deploy` wraps
-- each migration file in one.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'REMIX';
