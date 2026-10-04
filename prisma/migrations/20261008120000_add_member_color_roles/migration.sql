-- Member colour roles (`/color`).
--
-- Purely additive, and every column has a default that preserves today's
-- behaviour: colour roles stay off until an owner turns them on, and every
-- existing cosmetic-role row is attributed to the dashboard role maker that
-- actually created it.

-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "colorRolesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "colorRoleMode" TEXT NOT NULL DEFAULT 'FREE';

-- AlterTable
--
-- `source` records how a cosmetic role came to exist, so an owner looking at
-- the role list can tell one they made in Studio from one the bot made for a
-- member. `selfAssignable` is what a curated `/color` palette is drawn from;
-- it defaults off because a colour a member invented is not thereby approved
-- for everyone else.
ALTER TABLE "GuildCosmeticRole" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'STUDIO',
ADD COLUMN     "selfAssignable" BOOLEAN NOT NULL DEFAULT false;
