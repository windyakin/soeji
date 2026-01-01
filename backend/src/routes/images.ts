import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { MeiliSearch } from "meilisearch";
import { tagCache } from "../services/tagCache.js";

const router = Router();
const prisma = new PrismaClient();

// Meilisearch client
const meilisearchClient = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "masterKey",
});

// S3 URL configuration
const S3_PUBLIC_ENDPOINT = process.env.S3_PUBLIC_ENDPOINT || "http://localhost:9000";
const S3_BUCKET = process.env.S3_BUCKET || "soeji-images";

function buildS3Url(s3Key: string): string {
  return `${S3_PUBLIC_ENDPOINT}/${S3_BUCKET}/${s3Key}`;
}

router.get("/", async (req, res) => {
  try {
    const { limit = "20", offset = "0" } = req.query;

    const images = await prisma.image.findMany({
      take: parseInt(limit as string, 10),
      skip: parseInt(offset as string, 10),
      orderBy: { createdAt: "desc" },
      include: {
        metadata: true,
        tags: {
          include: { tag: true },
        },
      },
    });

    const total = await prisma.image.count();

    // Add s3Url to each image
    const imagesWithUrl = images.map((image) => ({
      ...image,
      s3Url: buildS3Url(image.s3Key),
    }));

    res.json({
      images: imagesWithUrl,
      total,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    console.error("Images fetch error:", error);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const image = await prisma.image.findUnique({
      where: { id },
      include: {
        metadata: true,
        tags: {
          include: { tag: true },
        },
      },
    });

    if (!image) {
      res.status(404).json({ error: "Image not found" });
      return;
    }

    // Add s3Url to the image
    res.json({
      ...image,
      s3Url: buildS3Url(image.s3Key),
    });
  } catch (error) {
    console.error("Image fetch error:", error);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

// Helper function to update Meilisearch index for images
async function updateMeilisearchIndex(imageIds: string[]): Promise<void> {
  const index = meilisearchClient.index("images");

  for (const imageId of imageIds) {
    const image = await prisma.image.findUnique({
      where: { id: imageId },
      include: {
        metadata: true,
        tags: { include: { tag: true } },
      },
    });

    if (!image) continue;

    // Rebuild tag arrays including user tags
    const allTags = image.tags.map((it) => it.tag.name);
    const positiveTags = image.tags
      .filter((it) => !it.isNegative)
      .map((it) => it.tag.name);
    const negativeTags = image.tags
      .filter((it) => it.isNegative)
      .map((it) => it.tag.name);
    const userTags = image.tags
      .filter((it) => it.source === "user")
      .map((it) => it.tag.name);
    const weightedTags = image.tags.map((it) => ({
      name: it.tag.name,
      weight: it.weight,
      isNegative: it.isNegative,
      source: it.source ?? "unknown",
    }));

    // Update document (partial update)
    await index.updateDocuments([
      {
        id: imageId,
        tags: allTags,
        positiveTags,
        negativeTags,
        userTags,
        weightedTags,
      },
    ]);
  }
}

// POST /api/images/tags - Batch add tags to multiple images
router.post("/tags", async (req, res) => {
  try {
    const { imageIds, tags } = req.body as { imageIds: string[]; tags: string[] };

    if (!imageIds?.length || !tags?.length) {
      res.status(400).json({ error: "imageIds and tags are required" });
      return;
    }

    // Limit batch size
    if (imageIds.length > 100) {
      res.status(400).json({ error: "Maximum 100 images per request" });
      return;
    }

    const results = await prisma.$transaction(async (tx) => {
      const updatedImageIds: string[] = [];

      for (const tagName of tags) {
        // Find or create tag
        let tag = await tx.tag.findUnique({ where: { name: tagName } });
        if (!tag) {
          // Use "user" category for user-created tags
          tag = await tx.tag.create({
            data: { name: tagName, category: "user" },
          });
        }

        // Add ImageTag for each image (upsert to avoid duplicates)
        for (const imageId of imageIds) {
          // Check if image exists
          const imageExists = await tx.image.findUnique({ where: { id: imageId } });
          if (!imageExists) continue;

          await tx.imageTag.upsert({
            where: { imageId_tagId: { imageId, tagId: tag.id } },
            create: {
              imageId,
              tagId: tag.id,
              weight: 1.0,
              isNegative: false,
              source: "user",
            },
            update: {}, // Do nothing if exists
          });

          if (!updatedImageIds.includes(imageId)) {
            updatedImageIds.push(imageId);
          }
        }
      }

      return updatedImageIds;
    });

    // Update Meilisearch index for affected images
    await updateMeilisearchIndex(results);

    // Trigger tag cache refresh
    await tagCache.refresh();

    res.json({
      success: true,
      updatedCount: results.length,
      tags,
    });
  } catch (error) {
    console.error("Batch tag error:", error);
    res.status(500).json({ error: "Failed to add tags" });
  }
});

// DELETE /api/images/:imageId/tags/:tagId - Remove tag from image
router.delete("/:imageId/tags/:tagId", async (req, res) => {
  try {
    const { imageId, tagId } = req.params;

    // Find the ImageTag
    const imageTag = await prisma.imageTag.findUnique({
      where: { imageId_tagId: { imageId, tagId } },
    });

    if (!imageTag) {
      res.status(404).json({ error: "Tag not found on image" });
      return;
    }

    // Only allow deleting user-created tags
    if (imageTag.source !== "user") {
      res.status(403).json({ error: "Cannot delete metadata tags" });
      return;
    }

    await prisma.imageTag.delete({
      where: { imageId_tagId: { imageId, tagId } },
    });

    // Update Meilisearch index
    await updateMeilisearchIndex([imageId]);

    // Trigger tag cache refresh
    await tagCache.refresh();

    res.json({ success: true });
  } catch (error) {
    console.error("Delete tag error:", error);
    res.status(500).json({ error: "Failed to delete tag" });
  }
});

export { router as imagesRouter };
