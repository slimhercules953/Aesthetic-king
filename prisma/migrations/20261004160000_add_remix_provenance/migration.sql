-- Remixing with attribution (Phase 7).
--
-- Provenance lives on the *copy*, not on the feed post. A remix is an
-- ordinary SavedAesthetic/SavedPalette that happens to know where it came
-- from, which means:
--
--   * the copy is editable and shareable like any other saved item, and
--     nothing special has to be threaded through the editors;
--   * attribution survives whether or not the remixer ever publishes it;
--   * attribution survives the *source* post being unshared, because the
--     author id is stored alongside the post id.
--
-- Both columns are nullable and both clear themselves rather than taking
-- the copy with them. Deleting the original creator's account must not
-- delete someone else's work, and unsharing a post must not orphan a remix
-- of it.

-- AlterTable
ALTER TABLE "SavedAesthetic" ADD COLUMN "remixedFromPostId" TEXT;
ALTER TABLE "SavedAesthetic" ADD COLUMN "remixedFromUserId" TEXT;

-- AlterTable
ALTER TABLE "SavedPalette" ADD COLUMN "remixedFromPostId" TEXT;
ALTER TABLE "SavedPalette" ADD COLUMN "remixedFromUserId" TEXT;

-- The attribution line on a feed card resolves the source post, and the
-- creator page counts remixes received. Both are lookups by these columns.
CREATE INDEX "SavedAesthetic_remixedFromPostId_idx"
ON "SavedAesthetic"("remixedFromPostId");

CREATE INDEX "SavedAesthetic_remixedFromUserId_idx"
ON "SavedAesthetic"("remixedFromUserId");

CREATE INDEX "SavedPalette_remixedFromPostId_idx"
ON "SavedPalette"("remixedFromPostId");

CREATE INDEX "SavedPalette_remixedFromUserId_idx"
ON "SavedPalette"("remixedFromUserId");

-- AddForeignKey
ALTER TABLE "SavedAesthetic"
ADD CONSTRAINT "SavedAesthetic_remixedFromPostId_fkey"
FOREIGN KEY ("remixedFromPostId")
REFERENCES "SharedPost"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "SavedAesthetic"
ADD CONSTRAINT "SavedAesthetic_remixedFromUserId_fkey"
FOREIGN KEY ("remixedFromUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "SavedPalette"
ADD CONSTRAINT "SavedPalette_remixedFromPostId_fkey"
FOREIGN KEY ("remixedFromPostId")
REFERENCES "SharedPost"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "SavedPalette"
ADD CONSTRAINT "SavedPalette_remixedFromUserId_fkey"
FOREIGN KEY ("remixedFromUserId")
REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
