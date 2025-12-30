export interface WeightedTag {
  name: string;
  weight: number;
  isNegative: boolean;
  source: string;
}

export interface SearchHit {
  id: string;
  filename: string;
  s3Url: string;
  prompt: string | null;
  v4BaseCaption: string | null;
  v4CharCaptions: string | null;
  tags: string[];
  positiveTags: string[];
  negativeTags: string[];
  weightedTags: WeightedTag[];
  seed: number | null;
  width: number | null;
  height: number | null;
  createdAt: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  totalHits: number;
  limit: number;
  offset: number;
}

export interface Tag {
  id: string;
  name: string;
  category: string | null;
}

export interface ImageTag {
  imageId: string;
  tagId: string;
  weight: number;
  isNegative: boolean;
  source: string | null;
  tag: Tag;
}

export interface ImageMetadata {
  id: string;
  imageId: string;
  prompt: string | null;
  seed: bigint | null;
  steps: number | null;
  scale: number | null;
  sampler: string | null;
  rawComment: string | null;
  v4BaseCaption: string | null;
  v4CharCaptions: unknown | null;
  negativePrompt: string | null;
}

export interface Image {
  id: string;
  filename: string;
  s3Key: string;
  s3Url: string;
  fileHash: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  metadata: ImageMetadata | null;
  tags: ImageTag[];
}

export interface ImagesResponse {
  images: Image[];
  total: number;
  limit: number;
  offset: number;
}

export interface TagListItem {
  id: string;
  name: string;
  category: string | null;
  imageCount: number;
}

export interface TagsResponse {
  tags: TagListItem[];
}
