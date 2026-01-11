import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { authenticate } from "../middleware/auth.js";
import { allRoles } from "../middleware/roleGuard.js";
import { searchTags } from "../services/tagSearchClient.js";

const router = Router();
const prisma = new PrismaClient();

// SSE client connections
const sseClients = new Map<string, Response>();

// All tag endpoints require authentication (any role)
router.use(authenticate, allRoles);

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

// Search/suggest tags by query (uses Meilisearch)
router.get("/suggest", async (req, res) => {
  try {
    const { q = "", limit = "10" } = req.query;
    const query = (q as string).trim();

    if (!query) {
      res.json({ tags: [] });
      return;
    }

    const tags = await searchTags(query, parseInt(limit as string, 10));

    res.json({
      tags: tags.map(({ id, name, category, imageCount }) => ({
        id,
        name,
        category,
        imageCount,
      })),
    });
  } catch (error) {
    console.error("Tag suggest error:", error);
    res.status(500).json({ error: "Failed to suggest tags" });
  }
});

// SSE endpoint for streaming tag suggestions
router.get("/suggest/stream", (req, res) => {
  const sessionId = crypto.randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

  // Send connected event with session ID
  res.write(`event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`);

  sseClients.set(sessionId, res);

  // Clean up on disconnect
  req.on("close", () => {
    sseClients.delete(sessionId);
  });
});

// Query endpoint for SSE clients
router.post("/suggest/query", async (req, res) => {
  try {
    const { sessionId, query, limit = 10 } = req.body;

    if (!sessionId || typeof sessionId !== "string") {
      res.status(400).json({ error: "Session ID required" });
      return;
    }

    const sseClient = sseClients.get(sessionId);
    if (!sseClient) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    const queryStr = (query as string || "").trim();

    if (!queryStr) {
      // Send empty results
      sseClient.write(`event: results\ndata: ${JSON.stringify({ query: "", tags: [] })}\n\n`);
      res.json({ success: true });
      return;
    }

    const tags = await searchTags(queryStr, parseInt(String(limit), 10));

    // Send results via SSE
    sseClient.write(`event: results\ndata: ${JSON.stringify({
      query: queryStr,
      tags: tags.map(({ id, name, category, imageCount }) => ({
        id,
        name,
        category,
        imageCount,
      })),
    })}\n\n`);

    res.json({ success: true });
  } catch (error) {
    console.error("SSE query error:", error);
    res.status(500).json({ error: "Query failed" });
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
