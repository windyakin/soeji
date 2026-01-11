import { MeiliSearch } from "meilisearch";

export const meilisearchClient = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST || "http://localhost:7700",
  apiKey: process.env.MEILISEARCH_API_KEY || "masterKey",
});

export const TAGS_INDEX_NAME = "tags";
export const IMAGES_INDEX_NAME = "images";
