import { NAIPngMetaReader } from "./NAIPngMetaReader.js";
import type { MetadataReader, MetadataReaderResult } from "./types.js";
import { createEmptyMetadata } from "./types.js";

/**
 * Registered metadata readers
 * Add new readers here to support additional image formats or generators
 */
const readers: MetadataReader[] = [
  new NAIPngMetaReader(),
  // Future readers can be added here:
  // new ComfyUIPngMetaReader(),
  // new Automatic1111PngMetaReader(),
];

/**
 * Detect the appropriate reader and extract metadata from a buffer
 *
 * @param buffer The image file buffer
 * @param extension The file extension (e.g., ".png")
 * @returns The metadata result from the first compatible reader
 */
export function detectAndReadMetadata(buffer: Buffer, extension: string): MetadataReaderResult {
  const normalizedExt = extension.toLowerCase();

  for (const reader of readers) {
    if (reader.supportedExtensions.includes(normalizedExt) && reader.canRead(buffer)) {
      return reader.read(buffer);
    }
  }

  return {
    success: true,
    format: "unknown",
    metadata: createEmptyMetadata(),
  };
}

/**
 * Get dimensions from a PNG buffer
 */
export function getPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  const reader = new NAIPngMetaReader();
  if (!reader.canRead(buffer)) {
    return null;
  }

  // Read IHDR chunk for dimensions
  const PNG_SIGNATURE_LENGTH = 8;
  if (buffer.length < PNG_SIGNATURE_LENGTH + 8) {
    return null;
  }

  let offset = PNG_SIGNATURE_LENGTH;

  // Read first chunk (should be IHDR)
  if (offset + 8 > buffer.length) return null;

  const length = buffer.readUInt32BE(offset);
  const type = buffer.toString("ascii", offset + 4, offset + 8);

  if (type !== "IHDR" || length < 8) return null;
  if (offset + 8 + length > buffer.length) return null;

  const width = buffer.readUInt32BE(offset + 8);
  const height = buffer.readUInt32BE(offset + 12);

  return { width, height };
}

// Re-export types and classes
export { NAIPngMetaReader };
export type { MetadataReader, MetadataReaderResult, ParsedMetadata } from "./types.js";
export { createEmptyMetadata } from "./types.js";
