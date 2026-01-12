export type UploadStatus = "pending" | "uploading" | "success" | "error" | "duplicate";

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number; // 0-100
  error?: string;
  result?: {
    imageId: string;
    s3Url: string;
    duplicate?: boolean;
  };
  xhr?: XMLHttpRequest; // For aborting uploads
  completedAt?: number; // Timestamp when upload completed (for sorting)
}

export interface UploadSuccessResponse {
  success: true;
  image: {
    id: string;
    filename: string;
    s3Url: string;
    width: number | null;
    height: number | null;
    metadataFormat: string;
    createdAt: string;
  };
}

export interface UploadDuplicateResponse {
  success: true;
  duplicate: true;
  existingImage: {
    id: string;
    filename: string;
    s3Url: string;
  };
}

export interface UploadErrorResponse {
  success: false;
  error: string;
  code: "INVALID_FILE" | "NOT_PNG" | "PROCESSING_ERROR";
}

export type UploadResponse =
  | UploadSuccessResponse
  | UploadDuplicateResponse
  | UploadErrorResponse;
