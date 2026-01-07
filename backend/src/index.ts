import "dotenv/config";
import express from "express";
import cors, { CorsOptions } from "cors";
import { searchRouter } from "./routes/search.js";
import { imagesRouter } from "./routes/images.js";
import { tagsRouter } from "./routes/tags.js";
import { statsRouter } from "./routes/stats.js";
import { tagCache } from "./services/tagCache.js";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration
function getCorsOptions(): CorsOptions {
  const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS;

  // If not set or empty, allow all origins (default behavior)
  if (!allowedOrigins || allowedOrigins.trim() === "") {
    return {};
  }

  // Parse comma-separated origins
  const origins = allowedOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (same-origin, curl, etc.)
      if (!origin || origins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  };
}

app.use(cors(getCorsOptions()));
app.use(express.json());

// Routes
app.use("/api/search", searchRouter);
app.use("/api/images", imagesRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/stats", statsRouter);

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
