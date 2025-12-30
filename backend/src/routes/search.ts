import { Router } from "express";
import { MeiliSearch } from "meilisearch";

const router = Router();

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "masterKey",
});

const INDEX_NAME = "images";

router.get("/", async (req, res) => {
  try {
    const { q = "", tags, limit = "20", offset = "0", sort, filter } = req.query;

    const index = client.index(INDEX_NAME);

    const filters: string[] = [];

    // Filter by positive tags only when specified
    if (filter === "positiveTags" && tags) {
      const tagList = (tags as string).split(",").map((t) => t.trim());
      for (const tag of tagList) {
        filters.push(`positiveTags = "${tag}"`);
      }
    } else if (tags) {
      const tagList = (tags as string).split(",").map((t) => t.trim());
      for (const tag of tagList) {
        filters.push(`tags = "${tag}"`);
      }
    }

    const result = await index.search(q as string, {
      filter: filters.length > 0 ? filters.join(" AND ") : undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      sort: sort ? [(sort as string)] : ["createdAt:desc"],
      attributesToSearchOn: filter === "positiveTags" ? ["positiveTags", "prompt", "v4BaseCaption"] : undefined,
    });

    res.json({
      hits: result.hits,
      totalHits: result.estimatedTotalHits || 0,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

export { router as searchRouter };
