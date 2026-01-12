import { Router } from "express";
import multer from "multer";
import { authenticateUpload } from "../middleware/auth.js";
import { processUploadedImage } from "../services/imageProcessor.js";

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "image/png") {
      cb(null, true);
    } else {
      cb(new Error("Only PNG files are allowed"));
    }
  },
});

// Apply authentication (admin or upload API key)
router.use(authenticateUpload);

/**
 * POST /api/upload
 * Upload a single PNG image
 *
 * Request:
 *   - Content-Type: multipart/form-data
 *   - file: PNG file (required)
 *
 * Response (201 Created):
 *   {
 *     "success": true,
 *     "image": {
 *       "id": "uuid",
 *       "filename": "original.png",
 *       "s3Url": "http://cdn/bucket/hash.png",
 *       "width": 1024,
 *       "height": 1024,
 *       "metadataFormat": "nai",
 *       "createdAt": "2026-01-11T..."
 *     }
 *   }
 *
 * Response (200 OK - duplicate):
 *   {
 *     "success": true,
 *     "duplicate": true,
 *     "existingImage": { "id", "filename", "s3Url" }
 *   }
 *
 * Response (400/500 Error):
 *   {
 *     "success": false,
 *     "error": "message",
 *     "code": "INVALID_FILE" | "NOT_PNG" | "PROCESSING_ERROR"
 *   }
 */
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
        code: "INVALID_FILE",
      });
    }

    const result = await processUploadedImage(
      req.file.buffer,
      req.file.originalname
    );

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error || "Processing failed",
        code: "PROCESSING_ERROR",
      });
    }

    if (result.duplicate) {
      return res.status(200).json({
        success: true,
        duplicate: true,
        existingImage: result.existingImage,
      });
    }

    return res.status(201).json({
      success: true,
      image: result.image,
    });
  } catch (error) {
    console.error("Upload error:", error);

    // Handle multer errors
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "File size exceeds 50MB limit",
          code: "INVALID_FILE",
        });
      }
      return res.status(400).json({
        success: false,
        error: error.message,
        code: "INVALID_FILE",
      });
    }

    // Handle file type error
    if (error instanceof Error && error.message === "Only PNG files are allowed") {
      return res.status(400).json({
        success: false,
        error: "Only PNG files are allowed",
        code: "NOT_PNG",
      });
    }

    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Upload failed",
      code: "PROCESSING_ERROR",
    });
  }
});

export { router as uploadRouter };
