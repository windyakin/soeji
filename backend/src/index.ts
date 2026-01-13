import "dotenv/config";
import express from "express";
import cors from "cors";
import type { CorsOptionsDelegate } from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import passport from "./config/passport.js";
import { searchRouter } from "./routes/search.js";
import { imagesRouter } from "./routes/images.js";
import { tagsRouter } from "./routes/tags.js";
import { statsRouter } from "./routes/stats.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { uploadRouter } from "./routes/upload.js";

const app = express();
const PORT = process.env.PORT || 3000;


// Dynamic CORS configuration
const dynamicCorsOptions: CorsOptionsDelegate<express.Request> = (req, callback) => {
  if (req.path.startsWith("/api/upload")) {
    callback(null, {
      origin: /^(https:\/\/novelai.net|chrome-extension:\/\/[a-z0-9]+|moz-extension:\/\/[a-z0-9\-]+)$/,
      methods: ["GET","POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Watcher-Key", "Authorization"],
    });
    return;
  }
  callback(null, {
    origin: /https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?/
  });
};

app.use(cors(dynamicCorsOptions));
app.use(express.json());
app.use(cookieParser());

// Access log
app.use(
  morgan(":method :url :status :res[content-length] - :response-time ms", {
    skip: (req) => req.url === "/health",
  })
);

// Initialize Passport (no session)
app.use(passport.initialize());

// Auth routes (no auth required for config, setup, login, refresh)
app.use("/api/auth", authRouter);

// User management routes (admin only)
app.use("/api/users", usersRouter);

// Upload route (admin or watcher API key)
app.use("/api/upload", uploadRouter);

// Protected routes
app.use("/api/search", searchRouter);
app.use("/api/images", imagesRouter);
app.use("/api/tags", tagsRouter);
app.use("/api/stats", statsRouter);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Start server
async function start() {
  app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
