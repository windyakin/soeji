import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

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

    res.json({
      images,
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

    res.json(image);
  } catch (error) {
    console.error("Image fetch error:", error);
    res.status(500).json({ error: "Failed to fetch image" });
  }
});

export { router as imagesRouter };
