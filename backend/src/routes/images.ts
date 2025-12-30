import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

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

export { router as imagesRouter };
