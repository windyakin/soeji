import { Router } from "express";
import { MeiliSearch } from "meilisearch";
import { authenticate } from "../middleware/auth.js";
import { allRoles } from "../middleware/roleGuard.js";

const router = Router();

// All search endpoints require authentication (any role)
router.use(authenticate, allRoles);

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "masterKey",
});

const INDEX_NAME = "images";

// S3 URL configuration
const S3_PUBLIC_ENDPOINT = process.env.S3_PUBLIC_ENDPOINT || "http://localhost:9000";
const S3_BUCKET = process.env.S3_BUCKET || "soeji-images";

function buildS3Url(s3Key: string): string {
  return `${S3_PUBLIC_ENDPOINT}/${S3_BUCKET}/${s3Key}`;
}

/**
 * Parse tag with prefix to determine which field to search
 * Prefixes:
 * - u:tagname → userTags only
 * - p:tagname → positiveTags only
 * - n:tagname → negativeTags only
 * - tagname (no prefix) → positiveTags (default)
 *
 * Returns: { tag: string, field: "positiveTags" | "negativeTags" | "userTags" | "tags" }
 */
function parseTagPrefix(tag: string): { tag: string; field: string } {
  const prefixMatch = tag.match(/^([upn]):(.+)$/i);
  if (prefixMatch) {
    const prefix = prefixMatch[1].toLowerCase();
    const tagName = prefixMatch[2];
    switch (prefix) {
      case "u":
        return { tag: tagName, field: "userTags" };
      case "p":
        return { tag: tagName, field: "positiveTags" };
      case "n":
        return { tag: tagName, field: "negativeTags" };
    }
  }
  // Default: positiveTags
  return { tag, field: "positiveTags" };
}

/**
 * Extract prefixed search terms from query string
 * Detects prefixed terms (u:, p:, n:) and groups them by target field
 * Also supports negative prefixes (-u:, -p:, -n:) for exclusion
 * Uses full-text search (not exact match filters) for fuzzy matching
 *
 * Returns: {
 *   prefixedTerms: Array<{term: string, field: string, exclude: boolean}>,
 *   remainingQuery: string,
 *   searchFields: string[] (unique fields to search on, excludes negative terms)
 * }
 */
function extractPrefixedTerms(query: string): {
  prefixedTerms: Array<{ term: string; field: string; exclude: boolean }>;
  remainingQuery: string;
  searchFields: string[];
} {
  const prefixedTerms: Array<{ term: string; field: string; exclude: boolean }> = [];
  const remainingTerms: string[] = [];
  const searchFieldsSet = new Set<string>();

  if (!query.trim()) {
    return { prefixedTerms, remainingQuery: "", searchFields: [] };
  }

  // Split by spaces but preserve quoted strings
  const regex = /("[^"]*"|\S+)/g;
  const matches = query.match(regex) || [];

  for (const term of matches) {
    // Match optional minus, then prefix (u/p/n), then colon, then content
    const prefixMatch = term.match(/^(-?)([upn]):(.+)$/i);
    if (prefixMatch) {
      const isExclude = prefixMatch[1] === "-";
      const prefix = prefixMatch[2].toLowerCase();
      const searchTerm = prefixMatch[3].replace(/^["']|["']$/g, "");
      let field: string;
      switch (prefix) {
        case "u":
          field = "userTags";
          break;
        case "p":
          field = "positiveTags";
          break;
        case "n":
          field = "negativeTags";
          break;
        default:
          field = "positiveTags";
      }
      prefixedTerms.push({ term: searchTerm, field, exclude: isExclude });
      // Only add to search fields if not excluding
      if (!isExclude) {
        searchFieldsSet.add(field);
      }
    } else {
      remainingTerms.push(term);
    }
  }

  return {
    prefixedTerms,
    remainingQuery: remainingTerms.join(" "),
    searchFields: Array.from(searchFieldsSet),
  };
}

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
      mode = "or", // "or" | "and" - default search mode
    } = req.query;

    const index = client.index(INDEX_NAME);

    const filters: string[] = [];

    // Extract prefixed search terms from query string (u:, p:, n: prefixes)
    // Also handles negative prefixes (-u:, -p:, -n:) for exclusion
    // These use full-text search on specific fields, not exact match filters
    const { prefixedTerms, remainingQuery, searchFields } = extractPrefixedTerms(q as string);

    // Separate include and exclude prefixed terms
    const includePrefixedTerms = prefixedTerms.filter((t) => !t.exclude);
    const excludePrefixedTerms = prefixedTerms.filter((t) => t.exclude);

    // Build search query: combine included prefixed terms with remaining query
    const prefixedSearchTerms = includePrefixedTerms.map((t) => t.term);
    const allSearchTerms = [...prefixedSearchTerms];

    // Also support legacy tags parameter with prefix support (uses exact match filter)
    if (tags) {
      const tagList = (tags as string).split(",").map((t) => t.trim());
      for (const rawTag of tagList) {
        const { tag, field } = parseTagPrefix(rawTag);
        filters.push(`${field} = "${tag}"`);
      }
    }

    // Parse the remaining search query (after prefixed terms removed)
    const parsed = parseSearchQuery(remainingQuery);
    const useAndMode = mode === "and" || parsed.useAnd;

    // Add remaining terms to search
    allSearchTerms.push(...parsed.includeTerms);

    // Build final search query
    const searchQuery = allSearchTerms.join(" ");

    // Determine which fields to search on
    // Default fields exclude negativeTags (only searched with explicit n: prefix)
    const defaultSearchFields = ["positiveTags", "userTags"];

    let attributesToSearchOn: string[];
    if (searchFields.length > 0 && parsed.includeTerms.length === 0) {
      // Only prefixed terms: search only on specified tag fields
      attributesToSearchOn = searchFields;
    } else if (searchFields.length > 0) {
      // Mixed: search on tag fields + default text fields (without duplicates)
      const combined = new Set([...searchFields, ...defaultSearchFields]);
      attributesToSearchOn = Array.from(combined);
    } else {
      // No prefixes: use default fields (excludes negativeTags)
      attributesToSearchOn = defaultSearchFields;
    }

    // Check if we need to apply client-side exclusion
    const hasExclusions = parsed.excludeTerms.length > 0 || excludePrefixedTerms.length > 0;

    // Perform search
    let result = await index.search(searchQuery, {
      filter: filters.length > 0 ? filters.join(" AND ") : undefined,
      limit: parseInt(limit as string, 10) * (hasExclusions ? 3 : 1), // Fetch more if excluding
      offset: hasExclusions ? 0 : parseInt(offset as string, 10),
      sort: sort ? [(sort as string)] : ["createdAt:desc"],
      attributesToSearchOn,
      matchingStrategy: useAndMode ? "all" : "last",
    });

    let hits = result.hits;

    // Apply exclude filter client-side (Meilisearch doesn't support NOT in search)
    if (hasExclusions) {
      const excludeLower = parsed.excludeTerms.map((t) => t.toLowerCase());

      hits = hits.filter((hit: Record<string, unknown>) => {
        // Check general exclude terms (from -term syntax)
        if (excludeLower.length > 0) {
          const searchableText = [
            hit.prompt,
            hit.v4BaseCaption,
            ...(Array.isArray(hit.positiveTags) ? hit.positiveTags : []),
            ...(Array.isArray(hit.tags) ? hit.tags : []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          if (excludeLower.some((term) => searchableText.includes(term))) {
            return false;
          }
        }

        // Check prefixed exclude terms (from -p:, -u:, -n: syntax)
        for (const { term, field } of excludePrefixedTerms) {
          const fieldValue = hit[field];
          if (Array.isArray(fieldValue)) {
            const fieldLower = fieldValue.map((v) => String(v).toLowerCase());
            const termLower = term.toLowerCase();
            if (fieldLower.some((v) => v.includes(termLower))) {
              return false;
            }
          }
        }

        return true;
      });

      // Apply offset and limit after filtering
      const offsetNum = parseInt(offset as string, 10);
      const limitNum = parseInt(limit as string, 10);
      hits = hits.slice(offsetNum, offsetNum + limitNum);
    }

    // Add s3Url to each hit based on s3Key
    const hitsWithUrl = hits.map((hit: Record<string, unknown>) => ({
      ...hit,
      s3Url: hit.s3Key ? buildS3Url(hit.s3Key as string) : null,
    }));

    res.json({
      hits: hitsWithUrl,
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
