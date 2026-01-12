/**
 * reindex.ts - 再インデックス・障害復旧バッチスクリプト
 *
 * 使い方:
 *   npm run reindex:dev -w @soeji/backend -- [options]
 *   npm run reindex -w @soeji/backend -- [options]  # ビルド後
 *
 * オプション:
 *   --master <mode>      マスターデータソース (デフォルト: db)
 *                        db  : DB をマスターとして欠落ファイルを補完
 *                        s3  : S3 をマスターとして DB を再構築 (未実装)
 *   --only <target>      特定の処理のみ実行
 *                        lossless-webp  : 欠落している lossless.webp を生成
 *                        metadata-json  : 欠落している metadata.json を生成
 *                        images         : 全画像を Meilisearch に再インデックス
 *                        tags           : 全タグを Meilisearch に再インデックス
 *   --batch-size <n>     バッチサイズ (デフォルト: 100)
 *   --concurrency <n>    並列処理数 (デフォルト: 5)
 *   --sleep <ms>         バッチ間のスリープ時間 (デフォルト: 0)
 *   --verbose            詳細ログを出力
 *   --dry-run            実際には変更せずシミュレーション
 *
 * 例:
 *   # 全処理実行
 *   npm run reindex:dev -w @soeji/backend
 *
 *   # lossless.webp のみ生成（ドライラン）
 *   npm run reindex:dev -w @soeji/backend -- --only lossless-webp --dry-run
 *
 *   # 低負荷で実行
 *   npm run reindex:dev -w @soeji/backend -- --batch-size 10 --concurrency 2 --sleep 1000
 *
 * 処理順序（--only 未指定時）:
 *   1. lossless-webp  : hasLosslessWebp=false の画像に対して lossless.webp を生成
 *   2. metadata-json  : hasMetadataFile=false の画像に対して metadata.json を生成
 *   3. images         : 全画像を Meilisearch に再インデックス
 *   4. tags           : 全タグを Meilisearch に再インデックス
 */

import "dotenv/config";
import { Command } from "commander";
import sharp from "sharp";
import { prisma } from "../services/database.js";
import {
  downloadFromS3,
  uploadBufferToS3,
  uploadMetadataToS3,
} from "../services/s3Client.js";
import { detectAndReadMetadata } from "../services/readers/index.js";
import {
  indexImage,
  updateImageIndex,
  initializeMeilisearch,
  initializeTagsIndex,
  clearTagsIndex,
  indexTags,
  tokenizeTagName,
  type ImageDocument,
  type TagDocument,
} from "../services/meilisearch.js";
import { buildImageDocument } from "../services/imageProcessor.js";
import type { ParsedMetadata } from "../services/readers/types.js";

type OnlyTarget = "lossless-webp" | "metadata-json" | "images" | "tags";
type MasterMode = "db" | "s3";

interface Options {
  master: MasterMode;
  only?: OnlyTarget;
  batchSize: number;
  concurrency: number;
  sleep: number;
  verbose: boolean;
  dryRun: boolean;
}

interface ImageWithRelations {
  id: string;
  filename: string;
  s3Key: string;
  fileHash: string;
  width: number | null;
  height: number | null;
  hasMetadataFile: boolean;
  hasLosslessWebp: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata: {
    id: string;
    prompt: string | null;
    seed: bigint | null;
    steps: number | null;
    scale: number | null;
    sampler: string | null;
    rawComment: string | null;
    v4BaseCaption: string | null;
    v4CharCaptions: unknown | null;
    negativePrompt: string | null;
  } | null;
  tags: Array<{
    tagId: string;
    imageId: string;
    weight: number;
    isNegative: boolean;
    source: string | null;
    tag: {
      id: string;
      name: string;
      category: string | null;
    };
  }>;
}

const program = new Command();

program
  .name("reindex")
  .description("Reindex images and tags, generate missing files")
  .option("--master <mode>", "Master data source: db | s3", "db")
  .option(
    "--only <target>",
    "Process only: lossless-webp | metadata-json | images | tags"
  )
  .option("--batch-size <n>", "Batch size", "100")
  .option("--concurrency <n>", "Concurrency level", "5")
  .option("--sleep <ms>", "Sleep between batches (ms)", "0")
  .option("--verbose", "Verbose output", false)
  .option("--dry-run", "Dry run mode", false);

program.parse(process.argv);

const rawOptions = program.opts();
const options: Options = {
  master: rawOptions.master as MasterMode,
  only: rawOptions.only as OnlyTarget | undefined,
  batchSize: parseInt(rawOptions.batchSize, 10),
  concurrency: parseInt(rawOptions.concurrency, 10),
  sleep: parseInt(rawOptions.sleep, 10),
  verbose: rawOptions.verbose,
  dryRun: rawOptions.dryRun,
};

// Utility functions
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processWithConcurrency<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  const queue = [...items];
  const workers = Array(Math.min(concurrency, queue.length))
    .fill(null)
    .map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await processor(item);
      }
    });
  await Promise.all(workers);
}

// Process functions
async function processLosslessWebpAll(options: Options): Promise<void> {
  console.log("\n=== Processing lossless-webp ===");

  // DB の hasLosslessWebp=false を信頼して処理対象を取得
  const images = await prisma.image.findMany({
    where: { hasLosslessWebp: false },
    select: { id: true, s3Key: true },
  });

  console.log(`Found ${images.length} images without lossless WebP`);

  if (images.length === 0) {
    console.log("No images to process");
    return;
  }

  let generated = 0;

  for (let i = 0; i < images.length; i += options.batchSize) {
    const batch = images.slice(i, i + options.batchSize);
    console.log(
      `Processing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(images.length / options.batchSize)}...`
    );

    await processWithConcurrency(
      batch,
      async (image) => {
        const webpKey = image.s3Key.replace(/\.png$/, ".lossless.webp");

        if (options.dryRun) {
          console.log(`  [dry-run] ${webpKey}`);
          generated++;
          return;
        }

        // PNG をダウンロードして WebP に変換
        const pngBuffer = await downloadFromS3(image.s3Key);
        const webpBuffer = await sharp(pngBuffer)
          .webp({ lossless: true, effort: 4 })
          .toBuffer();

        await uploadBufferToS3(webpBuffer, webpKey, "image/webp");

        // DB フラグ更新
        await prisma.image.update({
          where: { id: image.id },
          data: { hasLosslessWebp: true },
        });

        // Meilisearch インデックス更新
        await updateImageIndex(image.id, { hasLosslessWebp: true });

        console.log(`  [generated] ${webpKey}`);
        generated++;
      },
      options.concurrency
    );

    if (options.sleep > 0 && i + options.batchSize < images.length) {
      await sleep(options.sleep);
    }
  }

  console.log(`Completed: ${generated} generated`);
}

async function processMetadataJsonAll(options: Options): Promise<void> {
  console.log("\n=== Processing metadata-json ===");

  // DB の hasMetadataFile=false を信頼して処理対象を取得
  const images = await prisma.image.findMany({
    where: { hasMetadataFile: false },
    select: { id: true, s3Key: true, filename: true },
  });

  console.log(`Found ${images.length} images without metadata.json`);

  if (images.length === 0) {
    console.log("No images to process");
    return;
  }

  let generated = 0;

  for (let i = 0; i < images.length; i += options.batchSize) {
    const batch = images.slice(i, i + options.batchSize);
    console.log(
      `Processing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(images.length / options.batchSize)}...`
    );

    await processWithConcurrency(
      batch,
      async (image) => {
        const metadataKey = image.s3Key.replace(/\.png$/, ".metadata.json");

        if (options.dryRun) {
          console.log(`  [dry-run] ${metadataKey}`);
          generated++;
          return;
        }

        // PNG をダウンロードしてメタデータ抽出
        const pngBuffer = await downloadFromS3(image.s3Key);
        const result = detectAndReadMetadata(pngBuffer, ".png");

        const metadataJson = {
          format: result.format,
          metadata: result.metadata,
          uploadedAt: new Date().toISOString(),
          filename: image.filename,
        };

        await uploadMetadataToS3(JSON.stringify(metadataJson), metadataKey);
        await prisma.image.update({
          where: { id: image.id },
          data: { hasMetadataFile: true },
        });

        console.log(`  [generated] ${metadataKey}`);
        generated++;
      },
      options.concurrency
    );

    if (options.sleep > 0 && i + options.batchSize < images.length) {
      await sleep(options.sleep);
    }
  }

  console.log(`Completed: ${generated} generated`);
}

async function reindexImages(options: Options): Promise<void> {
  console.log("\n=== Reindexing images ===");

  await initializeMeilisearch();

  const images = (await prisma.image.findMany({
    include: { metadata: true, tags: { include: { tag: true } } },
  })) as unknown as ImageWithRelations[];

  console.log(`Found ${images.length} images to reindex`);

  let indexed = 0;

  for (let i = 0; i < images.length; i += options.batchSize) {
    const batch = images.slice(i, i + options.batchSize);
    console.log(
      `Processing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(images.length / options.batchSize)}...`
    );

    await processWithConcurrency(
      batch,
      async (image) => {
        if (options.dryRun) {
          console.log(`  [dry-run] ${image.s3Key}`);
          indexed++;
          return;
        }

        // Build metadata from DB record
        const metadata: ParsedMetadata | null = image.metadata
          ? {
              prompt: image.metadata.prompt,
              seed: image.metadata.seed ? Number(image.metadata.seed) : null,
              steps: image.metadata.steps,
              scale: image.metadata.scale,
              sampler: image.metadata.sampler,
              rawComment: image.metadata.rawComment,
              v4BaseCaption: image.metadata.v4BaseCaption,
              v4CharCaptions: image.metadata.v4CharCaptions as
                | string[]
                | null,
              negativePrompt: image.metadata.negativePrompt,
              width: image.width,
              height: image.height,
              tags: image.tags.map((t) => ({
                name: t.tag.name,
                weight: t.weight,
                isNegative: t.isNegative,
                source: t.source ?? "metadata",
              })),
            }
          : null;

        const document = buildImageDocument(
          {
            id: image.id,
            filename: image.filename,
            s3Key: image.s3Key,
            width: image.width,
            height: image.height,
            hasLosslessWebp: image.hasLosslessWebp,
            createdAt: image.createdAt,
          },
          metadata
        );

        await indexImage(document);
        indexed++;

        console.log(`  [indexed] ${image.s3Key}`);
      },
      options.concurrency
    );

    if (options.sleep > 0 && i + options.batchSize < images.length) {
      await sleep(options.sleep);
    }
  }

  console.log(`Reindexed ${indexed} images`);
}

async function reindexTags(options: Options): Promise<void> {
  console.log("\n=== Reindexing tags ===");

  await initializeTagsIndex();

  if (!options.dryRun) {
    await clearTagsIndex();
  }

  const tags = await prisma.tag.findMany({
    include: {
      images: {
        select: { isNegative: true, source: true },
      },
    },
  });

  console.log(`Found ${tags.length} tags to evaluate`);

  // タグ評価ロジック（50%以上ポジティブ or ユーザータグ）
  const tagsToIndex = tags
    .map((tag) => {
      const metadataPositive = tag.images.filter(
        (it) => !it.isNegative && it.source !== "user"
      ).length;
      const metadataNegative = tag.images.filter(
        (it) => it.isNegative && it.source !== "user"
      ).length;
      const userCount = tag.images.filter((it) => it.source === "user").length;
      const metadataTotal = metadataPositive + metadataNegative;

      const shouldIndex =
        userCount > 0 ||
        (metadataTotal > 0 && metadataPositive / metadataTotal > 0.5);

      return {
        tag,
        shouldIndex,
        imageCount: metadataPositive + userCount,
      };
    })
    .filter((t) => t.shouldIndex);

  console.log(`${tagsToIndex.length} tags qualified for indexing`);

  // バッチでインデックス
  const TAG_BATCH_SIZE = 1000;
  for (let i = 0; i < tagsToIndex.length; i += TAG_BATCH_SIZE) {
    const batch = tagsToIndex.slice(i, i + TAG_BATCH_SIZE).map(
      (t): TagDocument => ({
        id: t.tag.id,
        name: t.tag.name,
        nameTokens: tokenizeTagName(t.tag.name),
        category: t.tag.category,
        imageCount: t.imageCount,
      })
    );

    if (options.dryRun) {
      for (const tag of batch) {
        console.log(`  [dry-run] ${tag.name}`);
      }
    } else {
      await indexTags(batch);
      for (const tag of batch) {
        console.log(`  [indexed] ${tag.name}`);
      }
    }

    if (options.sleep > 0 && i + TAG_BATCH_SIZE < tagsToIndex.length) {
      await sleep(options.sleep);
    }
  }

  console.log(`Indexed ${tagsToIndex.length} tags`);
}

async function main(): Promise<void> {
  console.log("=== Reindex Script ===");
  console.log(`Options: ${JSON.stringify(options, null, 2)}`);

  // Validate master mode
  if (options.master === "s3") {
    console.error(
      "Error: --master s3 is not yet implemented. Currently only 'db' mode is supported."
    );
    process.exit(1);
  }

  if (options.master !== "db" && options.master !== "s3") {
    console.error(
      `Error: Invalid master mode '${options.master}'. Valid values are: db, s3`
    );
    process.exit(1);
  }

  const targets = options.only
    ? [options.only]
    : (["lossless-webp", "metadata-json", "images", "tags"] as OnlyTarget[]);

  for (const target of targets) {
    switch (target) {
      case "lossless-webp":
        await processLosslessWebpAll(options);
        break;
      case "metadata-json":
        await processMetadataJsonAll(options);
        break;
      case "images":
        await reindexImages(options);
        break;
      case "tags":
        await reindexTags(options);
        break;
    }
  }

  console.log("\n=== Reindex completed ===");
}

main()
  .catch((error) => {
    console.error("Reindex failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
