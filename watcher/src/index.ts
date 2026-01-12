import "dotenv/config";
import chokidar, { type FSWatcher } from "chokidar";
import * as fs from "node:fs";
import * as path from "node:path";
import FormData from "form-data";

const WATCH_DIR = process.env.WATCH_DIR || "./watch";
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
const WATCHER_API_KEY = process.env.WATCHER_API_KEY || "";
const DELETE_AFTER_PROCESS = process.env.DELETE_AFTER_PROCESS !== "false";

// PNG magic bytes
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Wait for a file to be completely written by checking:
 * 1. File size stability
 * 2. Valid PNG signature
 */
async function waitForFileReady(
  filePath: string,
  options: { maxWaitMs?: number; checkIntervalMs?: number } = {}
): Promise<boolean> {
  const { maxWaitMs = 60000, checkIntervalMs = 500 } = options;
  const startTime = Date.now();
  let lastSize = -1;
  let stableCount = 0;
  const requiredStableChecks = 3;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      const currentSize = stats.size;

      if (currentSize === lastSize && currentSize > 0) {
        stableCount++;

        if (stableCount >= requiredStableChecks) {
          const fd = fs.openSync(filePath, "r");
          try {
            const buffer = Buffer.alloc(8);
            const bytesRead = fs.readSync(fd, buffer, 0, 8, 0);

            if (bytesRead === 8 && buffer.equals(PNG_SIGNATURE)) {
              return true;
            }
          } finally {
            fs.closeSync(fd);
          }
          stableCount = 0;
        }
      } else {
        stableCount = 0;
      }

      lastSize = currentSize;
    } catch {
      stableCount = 0;
    }

    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }

  return false;
}

interface UploadResult {
  success: boolean;
  duplicate?: boolean;
  imageId?: string;
  error?: string;
}

/**
 * Upload a file to the backend API
 */
async function uploadToBackend(filePath: string): Promise<UploadResult> {
  const filename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);

  const form = new FormData();
  form.append("file", fileBuffer, {
    filename,
    contentType: "image/png",
  });

  const headers: Record<string, string> = {
    ...form.getHeaders(),
  };

  if (WATCHER_API_KEY) {
    headers["X-Watcher-Key"] = WATCHER_API_KEY;
  }

  const response = await fetch(`${BACKEND_URL}/api/upload`, {
    method: "POST",
    body: form.getBuffer(),
    headers,
  });

  const data = (await response.json()) as {
    success?: boolean;
    duplicate?: boolean;
    error?: string;
    image?: { id: string };
    existingImage?: { id: string };
  };

  if (!response.ok) {
    return {
      success: false,
      error: data.error || `HTTP ${response.status}`,
    };
  }

  return {
    success: true,
    duplicate: data.duplicate,
    imageId: data.image?.id || data.existingImage?.id,
  };
}

/**
 * Processing queue to prevent concurrent file processing
 */
class ProcessingQueue {
  private queue: string[] = [];
  private processing = false;
  private processedFiles = new Set<string>();

  async add(filePath: string): Promise<void> {
    if (this.processedFiles.has(filePath) || this.queue.includes(filePath)) {
      return;
    }

    this.queue.push(filePath);
    await this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const filePath = this.queue.shift()!;

      if (!fs.existsSync(filePath)) {
        console.log(`File no longer exists, skipping: ${path.basename(filePath)}`);
        continue;
      }

      this.processedFiles.add(filePath);
      const filename = path.basename(filePath);

      console.log(`Uploading: ${filename}`);

      try {
        const result = await uploadToBackend(filePath);

        if (result.success) {
          if (result.duplicate) {
            console.log(`Skipped (duplicate): ${filename}`);
          } else {
            console.log(`Successfully uploaded: ${filename} (ID: ${result.imageId})`);
          }

          // Delete file after successful upload
          if (DELETE_AFTER_PROCESS) {
            try {
              fs.unlinkSync(filePath);
              console.log(`Deleted: ${filename}`);
              this.processedFiles.delete(filePath);
            } catch (err) {
              console.error(`Failed to delete ${filename}:`, err);
            }
          }
        } else {
          console.error(`Failed to upload: ${filename} - ${result.error}`);
          this.processedFiles.delete(filePath);
        }
      } catch (error) {
        console.error(`Error uploading ${filename}:`, error);
        this.processedFiles.delete(filePath);
      }
    }

    this.processing = false;
  }
}

/**
 * Process existing files in directory
 */
async function processDirectory(dir: string): Promise<void> {
  if (!fs.existsSync(dir)) {
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
      const filePath = path.join(dir, entry.name);
      console.log(`Processing existing file: ${entry.name}`);

      const isReady = await waitForFileReady(filePath);
      if (isReady) {
        const result = await uploadToBackend(filePath);
        if (result.success) {
          if (result.duplicate) {
            console.log(`Skipped (duplicate): ${entry.name}`);
          } else {
            console.log(`Successfully uploaded: ${entry.name}`);
          }

          if (DELETE_AFTER_PROCESS) {
            try {
              fs.unlinkSync(filePath);
              console.log(`Deleted: ${entry.name}`);
            } catch (err) {
              console.error(`Failed to delete ${entry.name}:`, err);
            }
          }
        } else {
          console.error(`Failed to upload: ${entry.name} - ${result.error}`);
        }
      } else {
        console.log(`File not ready: ${entry.name}`);
      }
    }
  }
}

/**
 * Start watching a directory for new PNG files
 */
function startWatcher(watchDir: string): FSWatcher {
  if (!fs.existsSync(watchDir)) {
    fs.mkdirSync(watchDir, { recursive: true });
    console.log(`Created watch directory: ${watchDir}`);
  }

  const absolutePath = path.resolve(watchDir);
  console.log(`Watching directory: ${absolutePath}`);

  const processingQueue = new ProcessingQueue();

  const watcher = chokidar.watch(absolutePath, {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on("add", async (filePath) => {
    if (!filePath.toLowerCase().endsWith(".png") || filePath.endsWith(".lock")) {
      return;
    }

    const filename = path.basename(filePath);
    console.log(`New file detected: ${filename}`);

    console.log(`Waiting for file transfer to complete: ${filename}`);
    const isReady = await waitForFileReady(filePath);

    if (!isReady) {
      console.log(`File not ready or invalid after timeout, skipping: ${filename}`);
      return;
    }

    console.log(`File ready: ${filename}`);
    await processingQueue.add(filePath);
  });

  watcher.on("error", (error) => {
    console.error("Watcher error:", error);
  });

  watcher.on("ready", () => {
    console.log("Watcher is ready and monitoring for new PNG files");
  });

  return watcher;
}

async function main() {
  console.log("Starting soeji watcher...");
  console.log(`Watch directory: ${WATCH_DIR}`);
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`Delete after process: ${DELETE_AFTER_PROCESS}`);
  console.log(`API key configured: ${WATCHER_API_KEY ? "Yes" : "No"}`);

  // Process existing files
  console.log(`Processing existing files in ${WATCH_DIR}...`);
  await processDirectory(WATCH_DIR);

  // Start file watcher
  const watcher = startWatcher(WATCH_DIR);

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await watcher.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("\nWatcher is running. Press Ctrl+C to stop.");
}

main().catch((error) => {
  console.error("Failed to start watcher:", error);
  process.exit(1);
});
