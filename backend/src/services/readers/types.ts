import type { CharCaption, WeightedTag } from "../../types/prompt.js";

/**
 * Result returned by a metadata reader
 */
export interface MetadataReaderResult {
  /** Whether the read was successful */
  success: boolean;
  /** The format name (e.g., "nai", "comfy", "automatic1111") */
  format: string;
  /** Parsed metadata, or null if failed */
  metadata: ParsedMetadata | null;
  /** Error message if failed */
  error?: string;
}

/**
 * Parsed metadata from an image
 */
export interface ParsedMetadata {
  prompt: string | null;
  negativePrompt: string | null;
  seed: number | null;
  steps: number | null;
  scale: number | null;
  sampler: string | null;
  width: number | null;
  height: number | null;
  tags: WeightedTag[];
  v4BaseCaption: string | null;
  v4CharCaptions: CharCaption[] | null;
  rawComment: string;
}

/**
 * Interface for metadata readers
 * Implement this interface to add support for new image formats or generators
 */
export interface MetadataReader {
  /** The format name this reader handles */
  readonly formatName: string;
  /** File extensions this reader supports (e.g., [".png"]) */
  readonly supportedExtensions: string[];

  /**
   * Check if this reader can process the given buffer
   * @param buffer The image file buffer
   * @returns true if this reader can handle the format
   */
  canRead(buffer: Buffer): boolean;

  /**
   * Read metadata from the buffer
   * @param buffer The image file buffer
   * @returns The parsed metadata result
   */
  read(buffer: Buffer): MetadataReaderResult;
}

/**
 * Create an empty metadata result for images without metadata
 */
export function createEmptyMetadata(rawComment: string = ""): ParsedMetadata {
  return {
    prompt: null,
    negativePrompt: null,
    seed: null,
    steps: null,
    scale: null,
    sampler: null,
    width: null,
    height: null,
    tags: [],
    v4BaseCaption: null,
    v4CharCaptions: null,
    rawComment,
  };
}
