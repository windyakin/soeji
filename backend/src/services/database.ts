import { Prisma, PrismaClient } from "@prisma/client";
import type { ParsedPromptData } from "../types/prompt.js";

export const prisma = new PrismaClient();

/**
 * Find or create a tag outside of a transaction, handling concurrent creation race conditions.
 * Retries on unique constraint violation to fetch the tag created by another process.
 */
async function findOrCreateTag(name: string, category: string | null, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // First, try to find existing tag
    const existingTag = await prisma.tag.findUnique({ where: { name } });
    if (existingTag) {
      return existingTag;
    }

    // Try to create the tag
    try {
      return await prisma.tag.create({
        data: { name, category },
      });
    } catch (error) {
      // P2002: Unique constraint violation - another process created the tag
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        // Retry - the tag should now exist
        continue;
      }
      throw error;
    }
  }

  // Final attempt to find the tag after all retries
  const finalTag = await prisma.tag.findUnique({ where: { name } });
  if (finalTag) {
    return finalTag;
  }
  throw new Error(`Failed to find or create tag "${name}" after ${maxRetries} retries`);
}

export interface CreateImageInput {
  filename: string;
  s3Key: string;
  fileHash: string;
  width: number | null;
  height: number | null;
  hasMetadataFile: boolean;
  hasLosslessWebp: boolean;
  promptData: ParsedPromptData;
}

export interface CreateImageResult {
  image: {
    id: string;
    filename: string;
    s3Key: string;
    fileHash: string;
    width: number | null;
    height: number | null;
    createdAt: Date;
    updatedAt: Date;
  };
  tagIds: string[];
}

export async function createImageWithMetadata(input: CreateImageInput): Promise<CreateImageResult> {
  const { filename, s3Key, fileHash, width, height, hasMetadataFile, hasLosslessWebp, promptData } = input;

  // Pre-create all tags outside the transaction to avoid conflicts
  const tagMap = new Map<string, { id: string; weight: number; isNegative: boolean; source: string }>();
  for (const weightedTag of promptData.tags) {
    const colonIndex = weightedTag.name.indexOf(":");
    const category = colonIndex > 0 ? weightedTag.name.slice(0, colonIndex) : null;
    const tag = await findOrCreateTag(weightedTag.name, category);
    tagMap.set(weightedTag.name, {
      id: tag.id,
      weight: weightedTag.weight,
      isNegative: weightedTag.isNegative,
      source: weightedTag.source,
    });
  }

  return prisma.$transaction(async (tx) => {
    // Create image record
    const image = await tx.image.create({
      data: {
        filename,
        s3Key,
        fileHash,
        width,
        height,
        hasMetadataFile,
        hasLosslessWebp,
      },
    });

    // Create metadata
    await tx.imageMetadata.create({
      data: {
        imageId: image.id,
        prompt: promptData.prompt,
        seed: promptData.seed ? BigInt(promptData.seed) : null,
        steps: promptData.steps,
        scale: promptData.scale,
        sampler: promptData.sampler,
        rawComment: promptData.rawComment,
        v4BaseCaption: promptData.v4BaseCaption,
        v4CharCaptions: promptData.v4CharCaptions ? JSON.parse(JSON.stringify(promptData.v4CharCaptions)) : null,
        negativePrompt: promptData.negativePrompt,
      },
    });

    // Link tags to image (tags already created outside transaction)
    const tagIds: string[] = [];
    for (const [, tagData] of tagMap) {
      await tx.imageTag.create({
        data: {
          imageId: image.id,
          tagId: tagData.id,
          weight: tagData.weight,
          isNegative: tagData.isNegative,
          source: tagData.source,
        },
      });
      tagIds.push(tagData.id);
    }

    return { image, tagIds };
  });
}

export async function findImageByHash(hash: string) {
  return prisma.image.findUnique({
    where: { fileHash: hash },
    include: {
      metadata: true,
      tags: {
        include: { tag: true },
      },
    },
  });
}

export async function findImageById(id: string) {
  return prisma.image.findUnique({
    where: { id },
    include: {
      metadata: true,
      tags: {
        include: { tag: true },
      },
    },
  });
}

export async function findImagesByTag(tagName: string, limit = 20, offset = 0) {
  return prisma.image.findMany({
    where: {
      tags: {
        some: {
          tag: {
            name: tagName,
          },
        },
      },
    },
    include: {
      metadata: true,
      tags: {
        include: { tag: true },
      },
    },
    take: limit,
    skip: offset,
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteImage(id: string) {
  return prisma.image.delete({
    where: { id },
  });
}

export async function getAllTags() {
  return prisma.tag.findMany({
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
}
