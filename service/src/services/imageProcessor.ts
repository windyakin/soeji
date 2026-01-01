import * as path from "node:path";
import * as fs from "node:fs";
import { extractPngComment, parsePromptData, getPngDimensions } from "./pngReader.js";
import { uploadToS3, calculateFileHash } from "./s3Client.js";
import { createImageWithMetadata, findImageByHash } from "./database.js";
import { indexImage, type ImageDocument } from "./meilisearchClient.js";

export interface ProcessResult {
  success: boolean;
  imageId?: string;
  error?: string;
  skipped?: boolean;
  deleted?: boolean;
}

// In-memory set to track files currently being processed
const processingFiles = new Set<string>();

export async function processImage(
  filePath: string,
  options: { deleteAfterProcess?: boolean } = {}
): Promise<ProcessResult> {
  const { deleteAfterProcess = false } = options;
  const filename = path.basename(filePath);

  // Check if file is already being processed
  if (processingFiles.has(filePath)) {
    console.log(`File already being processed, skipping: ${filename}`);
    return { success: true, skipped: true };
  }

  // Mark file as being processed
  processingFiles.add(filePath);

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: "File does not exist" };
    }

    // Calculate hash first to check for duplicates
    const fileHash = calculateFileHash(filePath);
    const existingImage = await findImageByHash(fileHash);

    if (existingImage) {
      console.log(`Skipping duplicate: ${filename} (hash: ${fileHash.slice(0, 8)}...)`);

      if (deleteAfterProcess) {
        fs.unlinkSync(filePath);
        console.log(`Deleted duplicate file: ${filename}`);
      }

      return { success: true, skipped: true, imageId: existingImage.id, deleted: deleteAfterProcess };
    }

    // Extract PNG comment
    const rawComment = extractPngComment(filePath);
    if (!rawComment) {
      console.log(`No comment found in: ${filename}`);
      // Still process the image but with empty metadata
    }

    // Parse prompt data
    const promptData = rawComment
      ? parsePromptData(rawComment)
      : {
          prompt: null,
          seed: null,
          steps: null,
          scale: null,
          width: null,
          height: null,
          sampler: null,
          v4BaseCaption: null,
          v4CharCaptions: null,
          negativePrompt: null,
          tags: [],
          rawComment: "",
        };

    // Get dimensions from PNG
    const dimensions = getPngDimensions(filePath);

    // Upload to S3
    const { key: s3Key, hash } = await uploadToS3(filePath);
    console.log(`Uploaded to S3: ${s3Key}`);

    // Save to database
    const image = await createImageWithMetadata({
      filename,
      s3Key,
      fileHash: hash,
      width: dimensions?.width ?? promptData.width,
      height: dimensions?.height ?? promptData.height,
      promptData,
    });
    console.log(`Saved to database: ${image.id}`);

    // Index in Meilisearch
    const allTagNames = promptData.tags.map((t) => t.name);
    const positiveTags = promptData.tags.filter((t) => !t.isNegative).map((t) => t.name);
    const negativeTags = promptData.tags.filter((t) => t.isNegative).map((t) => t.name);
    const weightedTags = promptData.tags.map((t) => ({
      name: t.name,
      weight: t.weight,
      isNegative: t.isNegative,
      source: t.source,
    }));

    const searchDoc: ImageDocument = {
      id: image.id,
      filename,
      s3Key,
      prompt: promptData.prompt,
      v4BaseCaption: promptData.v4BaseCaption,
      v4CharCaptions: promptData.v4CharCaptions
        ? promptData.v4CharCaptions.map((c) => c.char_caption).join(" ")
        : null,
      tags: allTagNames,
      positiveTags,
      negativeTags,
      userTags: [], // Empty for new images, populated via user tagging
      weightedTags,
      seed: promptData.seed,
      width: dimensions?.width ?? promptData.width,
      height: dimensions?.height ?? promptData.height,
      createdAt: Date.now(),
    };

    await indexImage(searchDoc);
    console.log(`Indexed in Meilisearch: ${image.id}`);

    // Delete source file after successful processing
    if (deleteAfterProcess) {
      fs.unlinkSync(filePath);
      console.log(`Deleted source file: ${filename}`);
    }

    return { success: true, imageId: image.id, deleted: deleteAfterProcess };
  } catch (error) {
    let errorMessage = error instanceof Error ? error.message : String(error);

    // Provide more helpful error messages for common issues
    if (error instanceof Error && error.name === "AggregateError") {
      errorMessage = "Connection refused - ensure Docker containers are running (docker compose up -d)";
    }

    console.error(`Error processing ${filename}: ${errorMessage}`);
    if (error instanceof Error && error.stack && process.env.DEBUG) {
      console.error(error.stack);
    }
    return { success: false, error: errorMessage };
  } finally {
    // Remove from processing set
    processingFiles.delete(filePath);
  }
}

export async function processDirectory(
  dirPath: string,
  options: { deleteAfterProcess?: boolean } = {}
): Promise<ProcessResult[]> {
  const { deleteAfterProcess = true } = options;
  const results: ProcessResult[] = [];

  if (!fs.existsSync(dirPath)) {
    console.log(`Directory does not exist: ${dirPath}`);
    return results;
  }

  const files = fs.readdirSync(dirPath);
  const pngFiles = files.filter((f) => f.toLowerCase().endsWith(".png"));

  console.log(`Found ${pngFiles.length} PNG files in ${dirPath}`);

  for (const file of pngFiles) {
    const filePath = path.join(dirPath, file);
    const result = await processImage(filePath, { deleteAfterProcess });
    results.push(result);
  }

  return results;
}
