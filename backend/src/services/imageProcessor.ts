import * as path from "node:path";
import sharp from "sharp";
import { detectAndReadMetadata, getPngDimensions, createEmptyMetadata } from "./readers/index.js";
import type { ParsedMetadata } from "./readers/types.js";
import {
  calculateBufferHash,
  uploadBufferToS3,
  uploadMetadataToS3,
  buildS3Url,
} from "./s3Client.js";
import { createImageWithMetadata, findImageByHash } from "./database.js";
import { indexImage, type ImageDocument, type WeightedTagDocument } from "./meilisearch.js";
import { evaluateAndUpdateTags } from "./tagIndexer.js";
import type { ParsedPromptData, WeightedTag } from "../types/prompt.js";

// Environment variable to enable/disable lossless WebP generation
const ENABLE_LOSSLESS_WEBP = process.env.ENABLE_LOSSLESS_WEBP !== "false";

export interface ProcessResult {
  success: boolean;
  duplicate?: boolean;
  existingImage?: {
    id: string;
    filename: string;
    s3Url: string;
  };
  image?: {
    id: string;
    filename: string;
    s3Url: string;
    width: number | null;
    height: number | null;
    metadataFormat: string;
    createdAt: string;
  };
  error?: string;
}

/**
 * Convert PNG buffer to lossless WebP with metadata stripped
 */
async function convertToLosslessWebP(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .webp({
      lossless: true,
      effort: 4,
    })
    .toBuffer();
}

/**
 * Convert ParsedMetadata to ParsedPromptData for database storage
 */
function toParsedPromptData(metadata: ParsedMetadata): ParsedPromptData {
  return {
    prompt: metadata.prompt,
    seed: metadata.seed,
    steps: metadata.steps,
    scale: metadata.scale,
    width: metadata.width,
    height: metadata.height,
    sampler: metadata.sampler,
    v4BaseCaption: metadata.v4BaseCaption,
    v4CharCaptions: metadata.v4CharCaptions,
    negativePrompt: metadata.negativePrompt,
    tags: metadata.tags,
    rawComment: metadata.rawComment,
  };
}

/**
 * Build an ImageDocument for Meilisearch indexing
 */
export function buildImageDocument(
  image: {
    id: string;
    filename: string;
    s3Key: string;
    width: number | null;
    height: number | null;
    hasLosslessWebp: boolean;
    createdAt: Date;
  },
  metadata: ParsedMetadata | null
): ImageDocument {
  const positiveTags: string[] = [];
  const negativeTags: string[] = [];
  const userTags: string[] = [];
  const allTags: string[] = [];
  const weightedTags: WeightedTagDocument[] = [];

  if (metadata?.tags) {
    for (const tag of metadata.tags) {
      allTags.push(tag.name);
      weightedTags.push({
        name: tag.name,
        weight: tag.weight,
        isNegative: tag.isNegative,
        source: tag.source,
      });

      if (tag.source === "user") {
        userTags.push(tag.name);
      } else if (tag.isNegative) {
        negativeTags.push(tag.name);
      } else {
        positiveTags.push(tag.name);
      }
    }
  }

  return {
    id: image.id,
    filename: image.filename,
    s3Key: image.s3Key,
    prompt: metadata?.prompt ?? null,
    v4BaseCaption: metadata?.v4BaseCaption ?? null,
    v4CharCaptions: metadata?.v4CharCaptions
      ? JSON.stringify(metadata.v4CharCaptions)
      : null,
    tags: allTags,
    positiveTags,
    negativeTags,
    userTags,
    weightedTags,
    seed: metadata?.seed ?? null,
    width: image.width,
    height: image.height,
    hasLosslessWebp: image.hasLosslessWebp,
    createdAt: image.createdAt.getTime(),
  };
}

/**
 * Process an uploaded image buffer
 *
 * @param buffer The image file buffer
 * @param filename Original filename
 * @returns ProcessResult with the created image or duplicate info
 */
export async function processUploadedImage(
  buffer: Buffer,
  filename: string
): Promise<ProcessResult> {
  try {
    // Calculate hash for duplicate detection
    const fileHash = calculateBufferHash(buffer);

    // Check for duplicates
    const existingImage = await findImageByHash(fileHash);
    if (existingImage) {
      return {
        success: true,
        duplicate: true,
        existingImage: {
          id: existingImage.id,
          filename: existingImage.filename,
          s3Url: buildS3Url(existingImage.s3Key),
        },
      };
    }

    // Read metadata
    const extension = path.extname(filename).toLowerCase();
    const metadataResult = detectAndReadMetadata(buffer, extension);

    // Get dimensions from PNG header
    const dimensions = getPngDimensions(buffer);

    // Determine final dimensions (prefer PNG header, fallback to metadata)
    const finalWidth =
      dimensions?.width ?? metadataResult.metadata?.width ?? null;
    const finalHeight =
      dimensions?.height ?? metadataResult.metadata?.height ?? null;

    // Upload image to S3
    const s3Key = `${fileHash}.png`;
    await uploadBufferToS3(buffer, s3Key);

    // Generate and upload lossless WebP version (if enabled)
    let hasLosslessWebp = false;
    if (ENABLE_LOSSLESS_WEBP) {
      const webpBuffer = await convertToLosslessWebP(buffer);
      const webpKey = `${fileHash}.lossless.webp`;
      await uploadBufferToS3(webpBuffer, webpKey);
      hasLosslessWebp = true;
    }

    // Save metadata JSON to S3 alongside the image (no indentation for minimal size)
    const metadataKey = `${fileHash}.metadata.json`;
    const metadataJson = {
      format: metadataResult.format,
      metadata: metadataResult.metadata,
      uploadedAt: new Date().toISOString(),
      filename,
    };
    await uploadMetadataToS3(JSON.stringify(metadataJson), metadataKey);

    // Prepare prompt data for database
    const promptData = metadataResult.metadata
      ? toParsedPromptData(metadataResult.metadata)
      : toParsedPromptData(createEmptyMetadata());

    // Update dimensions in promptData if available
    if (finalWidth !== null) promptData.width = finalWidth;
    if (finalHeight !== null) promptData.height = finalHeight;

    // Save to database
    const { image, tagIds } = await createImageWithMetadata({
      filename,
      s3Key,
      fileHash,
      width: finalWidth,
      height: finalHeight,
      hasMetadataFile: true,
      hasLosslessWebp,
      promptData,
    });

    // Index in Meilisearch
    const imageDocument = buildImageDocument(
      {
        id: image.id,
        filename: image.filename,
        s3Key: image.s3Key,
        width: image.width,
        height: image.height,
        hasLosslessWebp,
        createdAt: image.createdAt,
      },
      metadataResult.metadata
    );
    await indexImage(imageDocument);

    // Update tag indexes
    if (tagIds.length > 0) {
      await evaluateAndUpdateTags(tagIds);
    }

    return {
      success: true,
      image: {
        id: image.id,
        filename: image.filename,
        s3Url: buildS3Url(image.s3Key),
        width: image.width,
        height: image.height,
        metadataFormat: metadataResult.format,
        createdAt: image.createdAt.toISOString(),
      },
    };
  } catch (error) {
    console.error("Image processing error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
