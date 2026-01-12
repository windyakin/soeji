import { MeiliSearch } from "meilisearch";

export const meilisearchClient = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "masterKey",
});

export const TAGS_INDEX_NAME = "tags";
export const IMAGES_INDEX_NAME = "images";

export interface WeightedTagDocument {
  name: string;
  weight: number;
  isNegative: boolean;
  source: string;
}

export interface TagDocument {
  id: string;
  name: string;
  nameTokens: string;
  category: string | null;
  imageCount: number;
}

export interface ImageDocument {
  id: string;
  filename: string;
  s3Key: string;
  prompt: string | null;
  v4BaseCaption: string | null;
  v4CharCaptions: string | null;
  tags: string[];
  positiveTags: string[];
  negativeTags: string[];
  userTags: string[];
  weightedTags: WeightedTagDocument[];
  seed: number | null;
  width: number | null;
  height: number | null;
  hasLosslessWebp: boolean;
  createdAt: number;
}

// Helper to tokenize tag name for better search
export function tokenizeTagName(name: string): string {
  return name.replace(/[_\-:]/g, " ");
}

export async function initializeMeilisearch(): Promise<void> {
  try {
    await meilisearchClient.getIndex(IMAGES_INDEX_NAME);
  } catch {
    await meilisearchClient.createIndex(IMAGES_INDEX_NAME, { primaryKey: "id" });
  }

  const index = meilisearchClient.index(IMAGES_INDEX_NAME);

  // Configure searchable attributes
  await index.updateSearchableAttributes([
    "prompt",
    "v4BaseCaption",
    "v4CharCaptions",
    "tags",
    "positiveTags",
    "negativeTags",
    "userTags",
    "filename",
  ]);

  // Configure filterable attributes
  await index.updateFilterableAttributes([
    "tags",
    "positiveTags",
    "negativeTags",
    "userTags",
    "seed",
    "width",
    "height",
    "createdAt",
  ]);

  // Configure sortable attributes
  await index.updateSortableAttributes(["createdAt", "seed"]);

  console.log("Meilisearch images index initialized");
}

export async function initializeTagsIndex(): Promise<void> {
  try {
    await meilisearchClient.getIndex(TAGS_INDEX_NAME);
  } catch {
    await meilisearchClient.createIndex(TAGS_INDEX_NAME, { primaryKey: "id" });
  }

  const index = meilisearchClient.index(TAGS_INDEX_NAME);

  // Configure searchable attributes (nameTokens for word-based search)
  await index.updateSearchableAttributes(["name", "nameTokens"]);

  // Configure sortable attributes for ranking by popularity
  await index.updateSortableAttributes(["imageCount"]);

  // Configure filterable attributes
  await index.updateFilterableAttributes(["category"]);

  // Configure typo tolerance
  await index.updateTypoTolerance({
    enabled: true,
    minWordSizeForTypos: {
      oneTypo: 2,
      twoTypos: 5,
    },
  });

  console.log("Meilisearch tags index initialized");
}

export async function indexImage(document: ImageDocument): Promise<void> {
  const index = meilisearchClient.index(IMAGES_INDEX_NAME);
  await index.addDocuments([document]);
}

export async function updateImageIndex(
  imageId: string,
  partialDocument: Partial<ImageDocument>
): Promise<void> {
  const index = meilisearchClient.index(IMAGES_INDEX_NAME);
  await index.updateDocuments([{ id: imageId, ...partialDocument }]);
}

export async function removeFromIndex(imageId: string): Promise<void> {
  const index = meilisearchClient.index(IMAGES_INDEX_NAME);
  await index.deleteDocument(imageId);
}

export async function searchImages(
  query: string,
  options?: {
    filter?: string;
    limit?: number;
    offset?: number;
    sort?: string[];
  }
): Promise<{ hits: ImageDocument[]; totalHits: number }> {
  const index = meilisearchClient.index(IMAGES_INDEX_NAME);

  const result = await index.search<ImageDocument>(query, {
    filter: options?.filter,
    limit: options?.limit || 20,
    offset: options?.offset || 0,
    sort: options?.sort,
  });

  return {
    hits: result.hits,
    totalHits: result.estimatedTotalHits || 0,
  };
}

export async function searchByTag(tag: string, limit = 20): Promise<ImageDocument[]> {
  const result = await searchImages("", {
    filter: `tags = "${tag}"`,
    limit,
  });
  return result.hits;
}

export async function searchByTags(tags: string[], limit = 20): Promise<ImageDocument[]> {
  const filter = tags.map((tag) => `tags = "${tag}"`).join(" AND ");
  const result = await searchImages("", {
    filter,
    limit,
  });
  return result.hits;
}

// Tag index operations
export async function indexTag(tag: TagDocument): Promise<void> {
  const index = meilisearchClient.index(TAGS_INDEX_NAME);
  await index.addDocuments([tag]);
}

export async function indexTags(tags: TagDocument[]): Promise<void> {
  if (tags.length === 0) return;
  const index = meilisearchClient.index(TAGS_INDEX_NAME);
  await index.addDocuments(tags);
}

export async function removeTagFromIndex(tagId: string): Promise<void> {
  const index = meilisearchClient.index(TAGS_INDEX_NAME);
  await index.deleteDocument(tagId);
}

export async function searchTags(
  query: string,
  limit: number = 10
): Promise<{ hits: TagDocument[]; totalHits: number }> {
  const index = meilisearchClient.index(TAGS_INDEX_NAME);

  const result = await index.search<TagDocument>(query, {
    limit,
    sort: ["imageCount:desc"],
  });

  return {
    hits: result.hits,
    totalHits: result.estimatedTotalHits || 0,
  };
}

export async function clearTagsIndex(): Promise<void> {
  const index = meilisearchClient.index(TAGS_INDEX_NAME);
  await index.deleteAllDocuments();
}
