import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

router.get("/", async (req, res) => {
  try {
    const { limit = "100", category } = req.query;

    const where = category ? { category: category as string } : {};

    const tags = await prisma.tag.findMany({
      where,
      take: parseInt(limit as string, 10),
      include: {
        _count: {
          select: { images: true },
        },
      },
      orderBy: {
        images: {
          _count: "desc",
        },
      },
    });

    res.json({
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        category: tag.category,
        imageCount: tag._count.images,
      })),
    });
  } catch (error) {
    console.error("Tags fetch error:", error);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// Search/suggest tags by query
router.get("/suggest", async (req, res) => {
  try {
    const { q = "", limit = "20" } = req.query;
    const query = (q as string).toLowerCase();

    if (!query) {
      res.json({ tags: [] });
      return;
    }

    const tags = await prisma.tag.findMany({
      where: {
        name: {
          contains: query,
          mode: "insensitive",
        },
      },
      take: parseInt(limit as string, 10),
      include: {
        _count: {
          select: { images: true },
        },
      },
      orderBy: {
        images: {
          _count: "desc",
        },
      },
    });

    res.json({
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        category: tag.category,
        imageCount: tag._count.images,
      })),
    });
  } catch (error) {
    console.error("Tag suggest error:", error);
    res.status(500).json({ error: "Failed to suggest tags" });
  }
});

router.get("/categories", async (_req, res) => {
  try {
    const categories = await prisma.tag.groupBy({
      by: ["category"],
      _count: { _all: true },
      orderBy: { _count: { category: "desc" } },
    });

    res.json({
      categories: categories
        .filter((c) => c.category !== null)
        .map((c) => ({
          name: c.category,
          count: c._count._all,
        })),
    });
  } catch (error) {
    console.error("Categories fetch error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

export { router as tagsRouter };
