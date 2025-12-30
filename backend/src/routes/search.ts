import { Router } from "express";
import { MeiliSearch } from "meilisearch";

const router = Router();

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "masterKey",
});

const INDEX_NAME = "images";

/**
 * Parse search query for AND/exclude operators
 * Syntax:
 * - Regular search: "cat dog" (OR by default)
 * - AND search: "cat AND dog" or "cat +dog"
 * - Exclude: "cat -dog" (find cat but not dog)
 *
 * Returns: { includeTerms: string[], excludeTerms: string[], useAnd: boolean }
 */
function parseSearchQuery(query: string): {
  includeTerms: string[];
  excludeTerms: string[];
  useAnd: boolean;
} {
  const includeTerms: string[] = [];
  const excludeTerms: string[] = [];
  let useAnd = false;

  if (!query.trim()) {
    return { includeTerms, excludeTerms, useAnd };
  }

  // Check for explicit AND operator
  if (query.includes(" AND ")) {
    useAnd = true;
    const parts = query.split(" AND ").map((p) => p.trim());
    for (const part of parts) {
      if (part.startsWith("-")) {
        excludeTerms.push(part.slice(1).trim());
      } else if (part.startsWith("+")) {
        includeTerms.push(part.slice(1).trim());
      } else if (part) {
        includeTerms.push(part);
      }
    }
  } else {
    // Parse individual terms
    // Split by spaces but preserve quoted strings
    const regex = /("[^"]*"|\S+)/g;
    const matches = query.match(regex) || [];

    for (const term of matches) {
      const cleanTerm = term.replace(/^["']|["']$/g, ""); // Remove quotes
      if (term.startsWith("-")) {
        excludeTerms.push(term.slice(1).replace(/^["']|["']$/g, ""));
      } else if (term.startsWith("+")) {
        useAnd = true;
        includeTerms.push(term.slice(1).replace(/^["']|["']$/g, ""));
      } else if (cleanTerm) {
        includeTerms.push(cleanTerm);
      }
    }

    // If any + prefix is used, treat all include terms as AND
    if (useAnd && includeTerms.length > 0) {
      // All terms should be ANDed
    }
  }

  return { includeTerms, excludeTerms, useAnd };
}

router.get("/", async (req, res) => {
  try {
    const {
      q = "",
      tags,
      limit = "20",
      offset = "0",
      sort,
      filter,
      mode = "or", // "or" | "and" - default search mode
    } = req.query;

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

    // Parse the search query
    const parsed = parseSearchQuery(q as string);
    const useAndMode = mode === "and" || parsed.useAnd;

    // Build search query
    let searchQuery = "";
    if (parsed.includeTerms.length > 0) {
      if (useAndMode) {
        // For AND search, we search each term separately and rely on Meilisearch
        // to find documents containing all terms
        searchQuery = parsed.includeTerms.join(" ");
      } else {
        searchQuery = parsed.includeTerms.join(" ");
      }
    }

    // Perform search
    let result = await index.search(searchQuery, {
      filter: filters.length > 0 ? filters.join(" AND ") : undefined,
      limit: parseInt(limit as string, 10) * (parsed.excludeTerms.length > 0 ? 3 : 1), // Fetch more if excluding
      offset: parsed.excludeTerms.length > 0 ? 0 : parseInt(offset as string, 10),
      sort: sort ? [(sort as string)] : ["createdAt:desc"],
      attributesToSearchOn:
        filter === "positiveTags"
          ? ["positiveTags", "prompt", "v4BaseCaption"]
          : undefined,
      matchingStrategy: useAndMode ? "all" : "last",
    });

    let hits = result.hits;

    // Apply exclude filter client-side (Meilisearch doesn't support NOT in search)
    if (parsed.excludeTerms.length > 0) {
      const excludeLower = parsed.excludeTerms.map((t) => t.toLowerCase());
      hits = hits.filter((hit: Record<string, unknown>) => {
        const searchableText = [
          hit.prompt,
          hit.v4BaseCaption,
          ...(Array.isArray(hit.positiveTags) ? hit.positiveTags : []),
          ...(Array.isArray(hit.tags) ? hit.tags : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return !excludeLower.some((term) => searchableText.includes(term));
      });

      // Apply offset and limit after filtering
      const offsetNum = parseInt(offset as string, 10);
      const limitNum = parseInt(limit as string, 10);
      hits = hits.slice(offsetNum, offsetNum + limitNum);
    }

    res.json({
      hits,
      totalHits: parsed.excludeTerms.length > 0 ? hits.length : (result.estimatedTotalHits || 0),
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: "Search failed" });
  }
});

export { router as searchRouter };
