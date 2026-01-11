import { prisma } from "./database.js";
import { meilisearchClient, TAGS_INDEX_NAME } from "./meilisearch.js";

export interface TagDocument {
  id: string;
  name: string;
  nameTokens: string;
  category: string | null;
  imageCount: number;
}

function tokenizeTagName(name: string): string {
  return name.replace(/[_\-:]/g, " ");
}

export interface TagEvaluation {
  shouldIndex: boolean;
  imageCount: number;
  tagName: string;
  category: string | null;
}

export async function evaluateTag(tagId: string): Promise<TagEvaluation | null> {
  const tag = await prisma.tag.findUnique({
    where: { id: tagId },
    include: {
      images: {
        select: {
          isNegative: true,
          source: true,
        },
      },
    },
  });

  if (!tag) {
    return null;
  }

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
    tagName: tag.name,
    category: tag.category,
  };
}

export async function evaluateAndUpdateTag(tagId: string): Promise<void> {
  const index = meilisearchClient.index(TAGS_INDEX_NAME);
  const evaluation = await evaluateTag(tagId);

  if (!evaluation) {
    // Tag was deleted, remove from index
    try {
      await index.deleteDocument(tagId);
    } catch {
      // Tag might not exist in index, ignore
    }
    return;
  }

  if (evaluation.shouldIndex) {
    const tagDocument: TagDocument = {
      id: tagId,
      name: evaluation.tagName,
      nameTokens: tokenizeTagName(evaluation.tagName),
      category: evaluation.category,
      imageCount: evaluation.imageCount,
    };
    await index.addDocuments([tagDocument]);
  } else {
    // Tag no longer passes filter, remove from index
    try {
      await index.deleteDocument(tagId);
    } catch {
      // Tag might not exist in index, ignore
    }
  }
}

export async function evaluateAndUpdateTags(tagIds: string[]): Promise<void> {
  for (const tagId of tagIds) {
    await evaluateAndUpdateTag(tagId);
  }
}
