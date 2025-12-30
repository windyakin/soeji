import * as fs from "node:fs";
import type { PngComment, ParsedPromptData, CharCaption, WeightedTag, TagSource } from "../types/prompt.js";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface PngChunk {
  type: string;
  data: Buffer;
}

function readChunks(buffer: Buffer): PngChunk[] {
  const chunks: PngChunk[] = [];
  let offset = 8; // Skip PNG signature

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length; // 4 (length) + 4 (type) + length + 4 (CRC)

    if (type === "IEND") break;
  }

  return chunks;
}

function parseTextChunk(data: Buffer): { keyword: string; text: string } | null {
  const nullIndex = data.indexOf(0);
  if (nullIndex === -1) return null;

  const keyword = data.toString("latin1", 0, nullIndex);
  const text = data.toString("latin1", nullIndex + 1);
  return { keyword, text };
}

function parseITXtChunk(data: Buffer): { keyword: string; text: string } | null {
  // iTXt format: keyword, null, compression flag, compression method, language tag, null, translated keyword, null, text
  let offset = 0;
  const nullIndex = data.indexOf(0, offset);
  if (nullIndex === -1) return null;

  const keyword = data.toString("utf8", 0, nullIndex);
  offset = nullIndex + 1;

  const compressionFlag = data[offset];
  offset += 2; // Skip compression flag and method

  // Skip language tag
  const langNullIndex = data.indexOf(0, offset);
  if (langNullIndex === -1) return null;
  offset = langNullIndex + 1;

  // Skip translated keyword
  const transNullIndex = data.indexOf(0, offset);
  if (transNullIndex === -1) return null;
  offset = transNullIndex + 1;

  let text: string;
  if (compressionFlag === 1) {
    // Compressed - need zlib decompression
    const zlib = require("node:zlib");
    const compressed = data.subarray(offset);
    text = zlib.inflateSync(compressed).toString("utf8");
  } else {
    text = data.toString("utf8", offset);
  }

  return { keyword, text };
}

function parseZTXtChunk(data: Buffer): { keyword: string; text: string } | null {
  const nullIndex = data.indexOf(0);
  if (nullIndex === -1) return null;

  const keyword = data.toString("latin1", 0, nullIndex);
  const compressionMethod = data[nullIndex + 1];

  if (compressionMethod !== 0) return null; // Only deflate is supported

  const zlib = require("node:zlib");
  const compressed = data.subarray(nullIndex + 2);
  const text = zlib.inflateSync(compressed).toString("utf8");

  return { keyword, text };
}

export function extractPngComment(filePath: string): string | null {
  const buffer = fs.readFileSync(filePath);

  // Verify PNG signature
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a valid PNG file");
  }

  const chunks = readChunks(buffer);

  for (const chunk of chunks) {
    let result: { keyword: string; text: string } | null = null;

    if (chunk.type === "tEXt") {
      result = parseTextChunk(chunk.data);
    } else if (chunk.type === "iTXt") {
      result = parseITXtChunk(chunk.data);
    } else if (chunk.type === "zTXt") {
      result = parseZTXtChunk(chunk.data);
    }

    if (result && result.keyword === "Comment") {
      return result.text;
    }
  }

  return null;
}

/**
 * Weight multipliers for different bracket types
 * Based on NovelAI/Stable Diffusion conventions:
 * - {} or () = 1.05x per level
 * - [] = 0.95x per level (de-emphasis)
 * - ::weight:: = explicit weight
 */
const BRACKET_WEIGHT_MULTIPLIER = 1.05;
const SQUARE_BRACKET_WEIGHT_MULTIPLIER = 0.95;

interface ParsedTagPart {
  tagName: string;
  weight: number;
  isNegative: boolean;
}

/**
 * Parse a single tag part and extract weight information
 */
function parseTagWeight(part: string): ParsedTagPart | null {
  let tagName = part.trim();
  let weight = 1.0;
  let isNegative = false;

  if (!tagName) return null;

  // Check for explicit weight syntax: -N::tag:: or N::tag::
  const explicitWeightMatch = tagName.match(/^(-?\d+(?:\.\d+)?)?::(.+)::$/);
  if (explicitWeightMatch) {
    const weightStr = explicitWeightMatch[1];
    tagName = explicitWeightMatch[2].trim();

    if (weightStr) {
      weight = parseFloat(weightStr);
      isNegative = weight < 0;
      weight = Math.abs(weight);
    }
  } else {
    // Count and strip brackets/braces
    // Handle nested brackets like {{{tag}}} or [[[tag]]]

    // Count curly braces for emphasis
    let curlyCount = 0;
    while (tagName.startsWith("{") && tagName.endsWith("}")) {
      tagName = tagName.slice(1, -1);
      curlyCount++;
    }

    // Count square brackets for de-emphasis
    let squareCount = 0;
    while (tagName.startsWith("[") && tagName.endsWith("]")) {
      tagName = tagName.slice(1, -1);
      squareCount++;
    }

    // Calculate weight
    if (curlyCount > 0) {
      weight = Math.pow(BRACKET_WEIGHT_MULTIPLIER, curlyCount);
    } else if (squareCount > 0) {
      weight = Math.pow(SQUARE_BRACKET_WEIGHT_MULTIPLIER, squareCount);
    }
  }

  tagName = tagName.trim();

  // Skip if only numbers/whitespace/punctuation
  if (!tagName || tagName.match(/^[\d\s.+-]+$/)) {
    return null;
  }

  // Normalize tag: lowercase, replace spaces with underscores
  const normalizedTag = tagName.toLowerCase().replace(/\s+/g, "_");
  if (normalizedTag.length === 0) {
    return null;
  }

  return {
    tagName: normalizedTag,
    weight,
    isNegative,
  };
}

/**
 * Expand control syntax in prompt to individual tags
 * - `-1::tag1, tag2::` -> ["-1::tag1::", "-1::tag2::"]
 * - `[[tag1, tag2]]` -> ["[[tag1]]", "[[tag2]]"]
 * - `{{tag1, tag2}}` -> ["{{tag1}}", "{{tag2}}"]
 */
function expandControlSyntax(prompt: string): string {
  let result = prompt;

  // Expand -N::tag1, tag2:: or N::tag1, tag2:: syntax
  result = result.replace(/(-?\d+(?:\.\d+)?)::((?:[^:]|:[^:])+)::/g, (_match, weight, content) => {
    const tags = content.split(",").map((t: string) => t.trim()).filter(Boolean);
    return tags.map((tag: string) => `${weight}::${tag}::`).join(", ");
  });

  // Expand nested brackets with comma inside
  // Handle {{{tag1, tag2}}} -> {{{tag1}}}, {{{tag2}}}
  // Handle [[tag1, tag2]] -> [[tag1]], [[tag2]]
  const expandBrackets = (str: string, openChar: string, closeChar: string): string => {
    const openEscaped = openChar.replace(/[{}[\]]/g, "\\$&");
    const closeEscaped = closeChar.replace(/[{}[\]]/g, "\\$&");

    // Match sequences of opening brackets, content (non-greedy), and matching closing brackets
    // Use a more careful approach: find bracket groups and check if they contain commas
    const regex = new RegExp(`(${openEscaped}+)([^${openEscaped}${closeEscaped}]+)(${closeEscaped}+)`, "g");

    return str.replace(regex, (match, openBrackets, content, closeBrackets) => {
      // Only expand if brackets are balanced and content has commas
      if (content.includes(",") && openBrackets.length === closeBrackets.length) {
        const tags = content.split(",").map((t: string) => t.trim()).filter(Boolean);
        return tags.map((tag: string) => `${openBrackets}${tag}${closeBrackets}`).join(", ");
      }
      return match;
    });
  };

  // Expand curly braces
  result = expandBrackets(result, "{", "}");

  // Expand square brackets
  result = expandBrackets(result, "[", "]");

  return result;
}

/**
 * Extract weighted tags from a prompt string
 */
function extractWeightedTags(prompt: string, source: TagSource, isNegativePrompt = false): WeightedTag[] {
  const tags: WeightedTag[] = [];
  const seenTags = new Set<string>();

  // Expand control syntax first
  const expandedPrompt = expandControlSyntax(prompt);

  // Split by comma
  const parts = expandedPrompt.split(",").map((p) => p.trim());

  for (const part of parts) {
    const parsed = parseTagWeight(part);
    if (!parsed) continue;

    // Avoid duplicates
    if (seenTags.has(parsed.tagName)) continue;
    seenTags.add(parsed.tagName);

    tags.push({
      name: parsed.tagName,
      weight: parsed.weight,
      isNegative: isNegativePrompt || parsed.isNegative,
      source,
    });
  }

  return tags;
}

export function parsePromptData(rawComment: string): ParsedPromptData {
  let commentData: PngComment;
  try {
    commentData = JSON.parse(rawComment);
  } catch {
    return {
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
      rawComment,
    };
  }

  const allTags: WeightedTag[] = [];
  const seenTagNames = new Set<string>();

  // Helper to add tags without duplicates (keep first occurrence with its weight)
  const addTags = (newTags: WeightedTag[]) => {
    for (const tag of newTags) {
      if (!seenTagNames.has(tag.name)) {
        seenTagNames.add(tag.name);
        allTags.push(tag);
      }
    }
  };

  // Extract tags from main prompt
  if (commentData.prompt) {
    addTags(extractWeightedTags(commentData.prompt, "prompt"));
  }

  // Extract tags from v4_prompt
  if (commentData.v4_prompt?.caption) {
    if (commentData.v4_prompt.caption.base_caption) {
      addTags(extractWeightedTags(commentData.v4_prompt.caption.base_caption, "v4_base"));
    }
    for (const charCaption of commentData.v4_prompt.caption.char_captions || []) {
      if (charCaption.char_caption) {
        addTags(extractWeightedTags(charCaption.char_caption, "v4_char"));
      }
    }
  }

  // Extract tags from negative prompt
  if (commentData.uc) {
    addTags(extractWeightedTags(commentData.uc, "negative", true));
  } else if (commentData.v4_negative_prompt?.caption?.base_caption) {
    addTags(extractWeightedTags(commentData.v4_negative_prompt.caption.base_caption, "negative", true));
  }

  return {
    prompt: commentData.prompt ?? null,
    seed: commentData.seed ?? null,
    steps: commentData.steps ?? null,
    scale: commentData.scale ?? null,
    width: commentData.width ?? null,
    height: commentData.height ?? null,
    sampler: commentData.sampler ?? null,
    v4BaseCaption: commentData.v4_prompt?.caption?.base_caption ?? null,
    v4CharCaptions: commentData.v4_prompt?.caption?.char_captions ?? null,
    negativePrompt: commentData.uc ?? commentData.v4_negative_prompt?.caption?.base_caption ?? null,
    tags: allTags,
    rawComment,
  };
}

// Export internal functions for testing
export const _internal = {
  parseTagWeight,
  expandControlSyntax,
  extractWeightedTags,
};

export function getPngDimensions(filePath: string): { width: number; height: number } | null {
  const buffer = fs.readFileSync(filePath);

  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return null;
  }

  const chunks = readChunks(buffer);
  const ihdrChunk = chunks.find((c) => c.type === "IHDR");

  if (!ihdrChunk) return null;

  const width = ihdrChunk.data.readUInt32BE(0);
  const height = ihdrChunk.data.readUInt32BE(4);

  return { width, height };
}
