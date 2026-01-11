import { PrismaClient } from "@prisma/client";
import type { ParsedPromptData } from "../types/prompt.js";

const prisma = new PrismaClient();

export interface CreateImageInput {
  filename: string;
  s3Key: string;
  fileHash: string;
  width: number | null;
  height: number | null;
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
  const { filename, s3Key, fileHash, width, height, promptData } = input;

  return prisma.$transaction(async (tx) => {
    // Create image record
    const image = await tx.image.create({
      data: {
        filename,
        s3Key,
        fileHash,
        width,
        height,
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

    // Create tags and link them with weight information
    const tagIds: string[] = [];
    for (const weightedTag of promptData.tags) {
      let tag = await tx.tag.findUnique({ where: { name: weightedTag.name } });

      if (!tag) {
        // Determine category from tag format (e.g., "artist:name" -> category: "artist")
        const colonIndex = weightedTag.name.indexOf(":");
        const category = colonIndex > 0 ? weightedTag.name.slice(0, colonIndex) : null;

        tag = await tx.tag.create({
          data: {
            name: weightedTag.name,
            category,
          },
        });
      }

      await tx.imageTag.create({
        data: {
          imageId: image.id,
          tagId: tag.id,
          weight: weightedTag.weight,
          isNegative: weightedTag.isNegative,
          source: weightedTag.source,
        },
      });

      tagIds.push(tag.id);
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

export { prisma };
