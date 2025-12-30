import chokidar, { type FSWatcher } from "chokidar";
import * as path from "node:path";
import * as fs from "node:fs";
import { processImage } from "./imageProcessor.js";

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
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      const currentSize = stats.size;

      // Check size stability
      if (currentSize === lastSize && currentSize > 0) {
        stableCount++;

        // After size is stable, verify PNG signature
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
          // PNG signature not valid yet, reset stable count
          stableCount = 0;
        }
      } else {
        stableCount = 0;
      }

      lastSize = currentSize;
    } catch {
      // File might be locked, continue waiting
      stableCount = 0;
    }

    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }

  return false;
}

export interface WatcherOptions {
  deleteAfterProcess?: boolean;
}

// Processing queue to prevent concurrent file processing
class ProcessingQueue {
  private queue: string[] = [];
  private processing = false;
  private processedFiles = new Set<string>();
  private deleteAfterProcess: boolean;

  constructor(deleteAfterProcess: boolean) {
    this.deleteAfterProcess = deleteAfterProcess;
  }

  async add(filePath: string): Promise<void> {
    // Skip if already processed or in queue
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

      // Check if file still exists (might have been deleted)
      if (!fs.existsSync(filePath)) {
        console.log(`File no longer exists, skipping: ${path.basename(filePath)}`);
        continue;
      }

      // Mark as processed to avoid reprocessing
      this.processedFiles.add(filePath);

      const filename = path.basename(filePath);
      console.log(`Processing: ${filename}`);

      try {
        const result = await processImage(filePath, {
          deleteAfterProcess: this.deleteAfterProcess,
        });

        if (result.success) {
          if (result.skipped) {
            console.log(`Skipped (duplicate): ${filename}`);
          } else {
            console.log(`Successfully processed: ${filename}`);
          }
          if (result.deleted) {
            console.log(`File deleted: ${filename}`);
            // Remove from processed set so the same path can be processed again
            this.processedFiles.delete(filePath);
          }
        } else {
          console.error(`Failed to process: ${filename} - ${result.error}`);
          // Remove from processed set so it can be retried
          this.processedFiles.delete(filePath);
        }
      } catch (error) {
        console.error(`Error processing ${filename}:`, error);
        this.processedFiles.delete(filePath);
      }
    }

    this.processing = false;
  }

  clearProcessedCache(): void {
    this.processedFiles.clear();
  }
}

export function startWatcher(watchDir: string, options: WatcherOptions = {}): FSWatcher {
  const { deleteAfterProcess = true } = options;

  // Ensure watch directory exists
  if (!fs.existsSync(watchDir)) {
    fs.mkdirSync(watchDir, { recursive: true });
    console.log(`Created watch directory: ${watchDir}`);
  }

  const absolutePath = path.resolve(watchDir);
  console.log(`Watching directory: ${absolutePath}`);
  console.log(`Delete after process: ${deleteAfterProcess}`);

  // Create processing queue
  const processingQueue = new ProcessingQueue(deleteAfterProcess);

  const watcher = chokidar.watch(absolutePath, {
    ignored: /(^|[\/\\])\../, // Ignore dotfiles
    persistent: true,
    ignoreInitial: true, // Don't process existing files (handled by processDirectory)
    awaitWriteFinish: {
      stabilityThreshold: 2000,
      pollInterval: 100,
    },
  });

  watcher.on("add", async (filePath) => {
    // Ignore non-PNG files and lock files
    if (!filePath.toLowerCase().endsWith(".png") || filePath.endsWith(".lock")) {
      return;
    }

    const filename = path.basename(filePath);
    console.log(`New file detected: ${filename}`);

    // Wait for file to be fully written and valid PNG
    console.log(`Waiting for file transfer to complete: ${filename}`);
    const isReady = await waitForFileReady(filePath);

    if (!isReady) {
      console.log(`File not ready or invalid after timeout, skipping: ${filename}`);
      return;
    }

    console.log(`File ready: ${filename}`);

    // Add to processing queue
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
