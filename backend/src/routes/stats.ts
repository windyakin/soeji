import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate } from "../middleware/auth.js";
import { allRoles } from "../middleware/roleGuard.js";

const router = Router();
const prisma = new PrismaClient();

// All stats endpoints require authentication (any role)
router.use(authenticate, allRoles);

// Cache TTLs
const BASIC_STATS_TTL = 5 * 60 * 1000; // 5 minutes
const HOT_TAGS_TTL = 60 * 60 * 1000; // 1 hour

// Separate caches for different data
let basicStatsCache: {
  data: BasicStats | null;
  timestamp: number;
} = {
  data: null,
  timestamp: 0,
};

let hotTagsCache: {
  data: RecentTag[];
  timestamp: number;
} = {
  data: [],
  timestamp: 0,
};

interface BasicStats {
  totalImages: number;
  totalTags: number;
  oldestImageDate: string | null;
  newestImageDate: string | null;
  recentImages24h: number;
  recentImages7d: number;
}

interface RecentTag {
  name: string;
  count: number;
}

interface StatsResponse extends BasicStats {
  recentTags: RecentTag[];
}

async function fetchBasicStats(): Promise<BasicStats> {
  const now = Date.now();

  // Return cached data if still valid
  if (basicStatsCache.data && now - basicStatsCache.timestamp < BASIC_STATS_TTL) {
    return basicStatsCache.data;
  }

  const nowDate = new Date();
  const date24hAgo = new Date(nowDate.getTime() - 24 * 60 * 60 * 1000);
  const date7dAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalImages,
    totalTags,
    oldestImage,
    newestImage,
    recentImages24h,
    recentImages7d,
  ] = await Promise.all([
    prisma.image.count(),
    prisma.tag.count(),
    prisma.image.findFirst({
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    }),
    prisma.image.findFirst({
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.image.count({
      where: { createdAt: { gte: date24hAgo } },
    }),
    prisma.image.count({
      where: { createdAt: { gte: date7dAgo } },
    }),
  ]);

  const data: BasicStats = {
    totalImages,
    totalTags,
    oldestImageDate: oldestImage?.createdAt.toISOString() ?? null,
    newestImageDate: newestImage?.createdAt.toISOString() ?? null,
    recentImages24h,
    recentImages7d,
  };

  // Update cache
  basicStatsCache = { data, timestamp: now };

  return data;
}

async function fetchHotTags(): Promise<RecentTag[]> {
  const now = Date.now();

  // Return cached data if still valid
  if (hotTagsCache.data.length > 0 && now - hotTagsCache.timestamp < HOT_TAGS_TTL) {
    return hotTagsCache.data;
  }

  // Get latest 50 image IDs
  const recentImageIds = await prisma.image.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true },
  });
  const imageIds = recentImageIds.map((img) => img.id);

  if (imageIds.length === 0) {
    hotTagsCache = { data: [], timestamp: now };
    return [];
  }

  // Get tags from latest 50 images
  const recentTagsRaw = await prisma.imageTag.groupBy({
    by: ["tagId"],
    where: {
      isNegative: false,
      imageId: { in: imageIds },
    },
    _count: { tagId: true },
    orderBy: { _count: { tagId: "desc" } },
    take: 30, // Get more to filter out ubiquitous tags
  });

  // Get tag names
  const tagIds = recentTagsRaw.map((t) => t.tagId);
  const tags = await prisma.tag.findMany({
    where: { id: { in: tagIds } },
    select: { id: true, name: true },
  });
  const tagNameMap = new Map(tags.map((t) => [t.id, t.name]));

  // Filter out tags that appear on all 50 images
  const recentImageCount = imageIds.length;
  const recentTags: RecentTag[] = recentTagsRaw
    .filter((t) => t._count.tagId < recentImageCount)
    .slice(0, 10)
    .map((t) => ({
      name: tagNameMap.get(t.tagId) || "Unknown",
      count: t._count.tagId,
    }));

  // Update cache
  hotTagsCache = { data: recentTags, timestamp: now };

  return recentTags;
}

router.get("/", async (_req, res) => {
  try {
    // Fetch both in parallel
    const [basicStats, recentTags] = await Promise.all([
      fetchBasicStats(),
      fetchHotTags(),
    ]);

    const data: StatsResponse = {
      ...basicStats,
      recentTags,
    };

    res.json(data);
  } catch (error) {
    console.error("Stats fetch error:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export { router as statsRouter };
