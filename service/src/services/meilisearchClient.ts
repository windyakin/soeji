import { MeiliSearch, Index } from "meilisearch";

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "masterKey",
});

const INDEX_NAME = "images";

export interface WeightedTagDocument {
  name: string;
  weight: number;
  isNegative: boolean;
  source: string;
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
  weightedTags: WeightedTagDocument[];
  seed: number | null;
  width: number | null;
  height: number | null;
  createdAt: number;
}

export async function initializeMeilisearch(): Promise<void> {
  try {
    await client.getIndex(INDEX_NAME);
  } catch {
    await client.createIndex(INDEX_NAME, { primaryKey: "id" });
  }

  const index = client.index(INDEX_NAME);

  // Configure searchable attributes
  await index.updateSearchableAttributes([
    "prompt",
    "v4BaseCaption",
    "v4CharCaptions",
    "tags",
    "positiveTags",
    "negativeTags",
    "filename",
  ]);

  // Configure filterable attributes
  await index.updateFilterableAttributes([
    "tags",
    "positiveTags",
    "negativeTags",
    "seed",
    "width",
    "height",
    "createdAt",
  ]);

  // Configure sortable attributes
  await index.updateSortableAttributes(["createdAt", "seed"]);

  console.log("Meilisearch index initialized");
}

export async function indexImage(document: ImageDocument): Promise<void> {
  const index = client.index(INDEX_NAME);
  await index.addDocuments([document]);
}

export async function removeFromIndex(imageId: string): Promise<void> {
  const index = client.index(INDEX_NAME);
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
  const index = client.index(INDEX_NAME);

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

export { client as meilisearchClient };
