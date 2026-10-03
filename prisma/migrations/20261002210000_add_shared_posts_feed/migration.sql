-- CreateEnum
CREATE TYPE "SharedItemType" AS ENUM ('AESTHETIC', 'PALETTE', 'ASSET');

-- CreateTable
CREATE TABLE "SharedPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemType" "SharedItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "caption" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "commentCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SharedPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedPostLike" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedPostLike_pkey" PRIMARY KEY ("userId", "postId")
);

-- CreateTable
CREATE TABLE "SharedPostComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedPostComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SharedPost_userId_itemType_itemId_key"
ON "SharedPost"("userId", "itemType", "itemId");

CREATE INDEX "SharedPost_createdAt_idx"
ON "SharedPost"("createdAt");

CREATE INDEX "SharedPost_likeCount_idx"
ON "SharedPost"("likeCount");

CREATE INDEX "SharedPost_itemType_itemId_idx"
ON "SharedPost"("itemType", "itemId");

CREATE INDEX "SharedPostLike_postId_idx"
ON "SharedPostLike"("postId");

CREATE INDEX "SharedPostComment_postId_createdAt_idx"
ON "SharedPostComment"("postId", "createdAt");

CREATE INDEX "SharedPostComment_userId_idx"
ON "SharedPostComment"("userId");

-- AddForeignKey
ALTER TABLE "SharedPost"
ADD CONSTRAINT "SharedPost_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPostLike"
ADD CONSTRAINT "SharedPostLike_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPostLike"
ADD CONSTRAINT "SharedPostLike_postId_fkey"
FOREIGN KEY ("postId")
REFERENCES "SharedPost"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPostComment"
ADD CONSTRAINT "SharedPostComment_postId_fkey"
FOREIGN KEY ("postId")
REFERENCES "SharedPost"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedPostComment"
ADD CONSTRAINT "SharedPostComment_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
