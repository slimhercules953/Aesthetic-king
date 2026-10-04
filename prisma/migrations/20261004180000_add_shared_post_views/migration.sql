-- Creator analytics (Phase 7).
--
-- One row per (post, viewer) instead of one row per impression. The page
-- needs two numbers that are easy to conflate: how many *people* saw a post
-- (honest reach) and how many *times* it was seen. Appending an impression
-- per card would let a single refreshed feed tab invent a four-figure view
-- count, so the row is upserted instead — `views` accumulates, `lastViewAt`
-- moves, and the row count is the unique audience.
--
-- The author is never recorded, so a creator browsing their own published
-- work does not become their own largest audience.
--
-- There is no denormalized `viewCount` on "SharedPost" the way there is for
-- likes and comments. Those are shown on every feed card, so they earn the
-- duplicate column; views are read only by the analytics page, which
-- aggregates over this table anyway. A counter maintained on every upsert
-- would be write cost paid for a number nobody displays.

-- CreateTable
CREATE TABLE "SharedPostView" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 1,
    "firstViewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedPostView_pkey" PRIMARY KEY ("userId", "postId")
);

-- Indexes
-- The analytics page sums and trends over one author's posts, which starts
-- by finding that author's posts and joining their viewers.
CREATE INDEX "SharedPostView_postId_lastViewAt_idx"
ON "SharedPostView"("postId", "lastViewAt");

CREATE INDEX "SharedPostView_userId_idx"
ON "SharedPostView"("userId");

-- AddForeignKey
ALTER TABLE "SharedPostView"
ADD CONSTRAINT "SharedPostView_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "SharedPostView"
ADD CONSTRAINT "SharedPostView_postId_fkey"
FOREIGN KEY ("postId")
REFERENCES "SharedPost"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
