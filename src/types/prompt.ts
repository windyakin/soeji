export interface CharCaption {
  char_caption: string;
  centers: Array<{ x: number; y: number }>;
}

export interface V4PromptCaption {
  base_caption: string;
  char_captions: CharCaption[];
}

export interface V4Prompt {
  caption: V4PromptCaption;
  use_coords: boolean;
  use_order: boolean;
  legacy_uc: boolean;
}

export interface PngComment {
  prompt?: string;
  steps?: number;
  height?: number;
  width?: number;
  scale?: number;
  uncond_scale?: number;
  cfg_rescale?: number;
  seed?: number;
  n_samples?: number;
  noise_schedule?: string;
  sampler?: string;
  v4_prompt?: V4Prompt;
  v4_negative_prompt?: V4Prompt;
  uc?: string;
  [key: string]: unknown;
}

export type TagSource = "prompt" | "v4_base" | "v4_char" | "negative";

export interface WeightedTag {
  name: string;
  weight: number; // 1.0 = normal, >1 = emphasized (e.g., {{}} = 1.21), <0 = negative
  isNegative: boolean;
  source: TagSource;
}

export interface ParsedPromptData {
  prompt: string | null;
  seed: number | null;
  steps: number | null;
  scale: number | null;
  width: number | null;
  height: number | null;
  sampler: string | null;
  v4BaseCaption: string | null;
  v4CharCaptions: CharCaption[] | null;
  negativePrompt: string | null;
  tags: WeightedTag[];
  rawComment: string;
}
