import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import passport from "./config/passport.js";
import { searchRouter } from "./routes/search.js";
import { imagesRouter } from "./routes/images.js";
import { tagsRouter } from "./routes/tags.js";
import { statsRouter } from "./routes/stats.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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
