import "dotenv/config";
import express from "express";
import cors from "cors";
import { searchRouter } from "./routes/search.js";
import { imagesRouter } from "./routes/images.js";
import { tagsRouter } from "./routes/tags.js";
import { tagCache } from "./services/tagCache.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use("/api/search", searchRouter);
app.use("/api/images", imagesRouter);
app.use("/api/tags", tagsRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Initialize cache and start server
async function start() {
  await tagCache.initialize();

  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
