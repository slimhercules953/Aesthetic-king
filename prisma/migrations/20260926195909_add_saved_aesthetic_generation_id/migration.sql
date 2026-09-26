/*
  Warnings:

  - A unique constraint covering the columns `[generationId]` on the table `SavedAesthetic` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "SavedAesthetic" ADD COLUMN     "generationId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "SavedAesthetic_generationId_key" ON "SavedAesthetic"("generationId");
