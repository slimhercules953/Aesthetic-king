-- Phase 8: removing the unused PROFILE_UPDATED notification type.
--
-- Nothing ever wrote this notice. The comment on the member described "a
-- profile the user built was edited - by them or by the bot applying a new
-- default", but no such path exists: the bot never touches the Profile table
-- (only the Studio profile builder writes it, always by the owner, who is
-- already looking at the screen doing the edit), and there is no sweep that
-- applies new defaults to existing profiles. A type with no emitter is a
-- member the UI has to handle forever for a notice that can never arrive.
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so the enum is rebuilt. The
-- rename is what makes that safe: Postgres rewrites the column type of every
-- dependent table as part of the rename, so the USING cast below only has to
-- convert from the old type to the new one.
--
-- No row can be lost. The cast would fail loudly if any PROFILE_UPDATED row
-- existed, and none can: no code path ever inserted one.
--
-- Unlike ADD VALUE, this whole script is fine inside the single transaction
-- Prisma wraps around each migration file - the new values are not merely
-- referenced here, they are created and consumed by a type cast, which
-- Postgres permits once the old type has been renamed away.

-- Rename the current enum out of the way
ALTER TYPE "public"."NotificationType" RENAME TO "NotificationType_old";

-- Recreate it without PROFILE_UPDATED. REMIX is included because it was added
-- by a later migration and must survive the rebuild.
CREATE TYPE "public"."NotificationType" AS ENUM ('LIKE', 'PREMIUM_GRANTED', 'PREMIUM_REVOKED', 'PREMIUM_EXPIRING', 'BOT_UPDATE', 'VOTE', 'SERVER', 'REMIX');

-- Point the column at the new type
ALTER TABLE "public"."Notification"
  ALTER COLUMN "type" TYPE "public"."NotificationType"
  USING ("type"::text::"public"."NotificationType");

-- Drop the old type
DROP TYPE "public"."NotificationType_old";