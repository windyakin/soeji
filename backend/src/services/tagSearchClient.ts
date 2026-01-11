import { meilisearchClient, TAGS_INDEX_NAME } from "./meilisearch.js";

export interface TagSearchResult {
  id: string;
  name: string;
  category: string | null;
  imageCount: number;
}

export async function searchTags(
  query: string,
  limit: number = 10
): Promise<TagSearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  // Search in Meilisearch (word-based search + typo tolerance)
  const index = meilisearchClient.index(TAGS_INDEX_NAME);
  const meilisearchResults = await index.search<TagSearchResult>(query, {
    limit,
    sort: ["imageCount:desc"],
  });

  return meilisearchResults.hits;
}
