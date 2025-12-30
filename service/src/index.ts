import "dotenv/config";
import { initializeMeilisearch } from "./services/meilisearchClient.js";
import { startWatcher } from "./services/watcher.js";
import { prisma } from "./services/database.js";
import { processDirectory } from "./services/imageProcessor.js";

const WATCH_DIR = process.env.WATCH_DIR || "./watch";
const DELETE_AFTER_PROCESS = process.env.DELETE_AFTER_PROCESS !== "false";

async function main() {
  console.log("Starting soeji image management system...");
  console.log(`Watch directory: ${WATCH_DIR}`);
  console.log(`Delete after process: ${DELETE_AFTER_PROCESS}`);

  try {
    // Initialize Meilisearch index
    console.log("Initializing Meilisearch...");
    await initializeMeilisearch();

    // Test database connection
    console.log("Testing database connection...");
    await prisma.$connect();
    console.log("Database connected");

    // Process any existing files in the watch directory
    console.log(`Processing existing files in ${WATCH_DIR}...`);
    const results = await processDirectory(WATCH_DIR, { deleteAfterProcess: DELETE_AFTER_PROCESS });
    const successful = results.filter((r) => r.success && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    const deleted = results.filter((r) => r.deleted).length;
    const failed = results.filter((r) => !r.success).length;
    console.log(`Processed ${successful} new files, skipped ${skipped} duplicates, deleted ${deleted} files, ${failed} failed`);

    // Start file watcher
    const watcher = startWatcher(WATCH_DIR, { deleteAfterProcess: DELETE_AFTER_PROCESS });

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log("\nShutting down...");
      await watcher.close();
      await prisma.$disconnect();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    console.log("\nsoeji is running. Press Ctrl+C to stop.");
  } catch (error) {
    console.error("Failed to start:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

main();
