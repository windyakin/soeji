-- AlterTable
ALTER TABLE "Image" ADD COLUMN "hasMetadataFile" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Image_hasMetadataFile_idx" ON "Image"("hasMetadataFile");
