import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  initializeTagsIndex,
  clearTagsIndex,
  indexTags,
  tokenizeTagName,
  TagDocument,
} from "../services/meilisearchClient.js";

const prisma = new PrismaClient();

interface TagWithUsage {
  id: string;
  name: string;
  category: string | null;
  images: {
    isNegative: boolean;
    source: string | null;
  }[];
}

function evaluateTag(tag: TagWithUsage): { shouldIndex: boolean; imageCount: number } {
  const metadataPositiveCount = tag.images.filter(
    (it) => !it.isNegative && it.source !== "user"
  ).length;
  const metadataNegativeCount = tag.images.filter(
    (it) => it.isNegative && it.source !== "user"
  ).length;
  const userCount = tag.images.filter((it) => it.source === "user").length;
  const metadataTotal = metadataPositiveCount + metadataNegativeCount;

  // Include tags with >50% positive metadata usage OR user-created tags
  const isUserTag = userCount > 0;
  const isPositiveTag = metadataTotal > 0 && metadataPositiveCount / metadataTotal > 0.5;

  return {
    shouldIndex: isUserTag || isPositiveTag,
    imageCount: metadataPositiveCount + userCount,
  };
}

async function main() {
  console.log("Starting tag reindex from database...");

  // Initialize tags index
  console.log("Initializing Meilisearch tags index...");
  await initializeTagsIndex();

  // Clear existing tags in index
  console.log("Clearing existing tags from index...");
  await clearTagsIndex();

  // Fetch all tags with their usage
  console.log("Fetching tags from database...");
  const dbTags = await prisma.tag.findMany({
    include: {
      images: {
        select: {
          isNegative: true,
          source: true,
        },
      },
    },
  });

  console.log(`Found ${dbTags.length} tags in database`);

  // Filter and transform tags
  const tagsToIndex: TagDocument[] = [];

  for (const tag of dbTags) {
    const { shouldIndex, imageCount } = evaluateTag(tag);

    if (shouldIndex) {
      tagsToIndex.push({
        id: tag.id,
        name: tag.name,
        nameTokens: tokenizeTagName(tag.name),
        category: tag.category,
        imageCount,
      });
    }
  }

  console.log(`${tagsToIndex.length} tags passed the 50%+ positive filter`);

  // Index tags in batches
  const BATCH_SIZE = 1000;
  for (let i = 0; i < tagsToIndex.length; i += BATCH_SIZE) {
    const batch = tagsToIndex.slice(i, i + BATCH_SIZE);
    await indexTags(batch);
    console.log(`Indexed ${Math.min(i + BATCH_SIZE, tagsToIndex.length)}/${tagsToIndex.length} tags`);
  }

  console.log("Tag reindex completed successfully!");
}

main()
  .catch((error) => {
    console.error("Tag reindex failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
