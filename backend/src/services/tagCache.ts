import { PrismaClient } from "@prisma/client";

export interface CachedTag {
  id: string;
  name: string;
  nameLower: string; // Pre-computed for faster search
  category: string | null;
  imageCount: number; // Positive usage count
}

class TagCacheService {
  private tags: CachedTag[] = [];
  private lastRefresh: Date | null = null;
  private refreshIntervalMs = 5 * 60 * 1000; // 5 minutes
  private isRefreshing = false;
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  /**
   * Initialize cache on startup
   */
  async initialize(): Promise<void> {
    console.log("Initializing tag cache...");
    await this.refresh();
    console.log(`Tag cache initialized with ${this.tags.length} tags`);

    // Set up periodic refresh
    setInterval(() => {
      this.refreshIfNeeded();
    }, 60 * 1000); // Check every minute
  }

  /**
   * Refresh cache if stale
   */
  private async refreshIfNeeded(): Promise<void> {
    if (this.lastRefresh && Date.now() - this.lastRefresh.getTime() < this.refreshIntervalMs) {
      return;
    }
    await this.refresh();
  }

  /**
   * Force refresh the cache
   */
  async refresh(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    this.isRefreshing = true;

    try {
      // Fetch all tags with their positive/negative usage counts
      const dbTags = await this.prisma.tag.findMany({
        include: {
          images: {
            select: {
              isNegative: true,
            },
          },
        },
      });

      // Process and filter tags
      const processedTags: CachedTag[] = [];

      for (const tag of dbTags) {
        const positiveCount = tag.images.filter((it) => !it.isNegative).length;
        const negativeCount = tag.images.filter((it) => it.isNegative).length;
        const total = positiveCount + negativeCount;

        // Only include tags with >50% positive usage
        if (total > 0 && positiveCount / total > 0.5) {
          processedTags.push({
            id: tag.id,
            name: tag.name,
            nameLower: tag.name.toLowerCase(),
            category: tag.category,
            imageCount: positiveCount,
          });
        }
      }

      // Sort by imageCount descending (for faster suggestion results)
      processedTags.sort((a, b) => b.imageCount - a.imageCount);

      this.tags = processedTags;
      this.lastRefresh = new Date();

      console.log(`Tag cache refreshed: ${this.tags.length} tags`);
    } catch (error) {
      console.error("Failed to refresh tag cache:", error);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * Search tags by query (case-insensitive contains)
   */
  suggest(query: string, limit: number = 10): CachedTag[] {
    if (!query) {
      return [];
    }

    const queryLower = query.toLowerCase();

    // Filter and return top matches
    // Tags are already sorted by imageCount, so just filter and slice
    const matches: CachedTag[] = [];

    for (const tag of this.tags) {
      if (tag.nameLower.includes(queryLower)) {
        matches.push(tag);
        if (matches.length >= limit) {
          break;
        }
      }
    }

    return matches;
  }

  /**
   * Get cache stats
   */
  getStats() {
    return {
      tagCount: this.tags.length,
      lastRefresh: this.lastRefresh,
      isRefreshing: this.isRefreshing,
    };
  }
}

// Singleton instance
export const tagCache = new TagCacheService();
