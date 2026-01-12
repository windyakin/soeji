/**
 * useUpload - アップロードキュー管理 Composable
 *
 * ## 進捗率（totalProgress）の計算方式
 *
 * ### 問題点
 * 単純に「完了アイテム数 / 全アイテム数」で計算すると、アップロード中にアイテムが
 * 完了してキューから削除されるたびに分母が変わり、進捗バーがジャンプしてしまう。
 *
 * 例: 10ファイルアップロード中、5ファイル完了時
 * - 単純計算: 5/10 = 50% → 次のファイル完了で 6/9 = 66% に急上昇
 *
 * ### 解決策: セッションベースの進捗追跡
 *
 * アップロードセッション開始時に「セッション内の総アイテム数」を固定し、
 * その数を分母として使い続ける。
 *
 * | 変数                     | 用途                                           |
 * |--------------------------|------------------------------------------------|
 * | sessionTotalItems        | セッション内の総アイテム数（途中追加で増加）   |
 * | sessionCompletedProgress | 完了アイテムの進捗合計（各100%で加算）         |
 *
 * ### 計算式
 * ```
 * totalProgress = (sessionCompletedProgress + activeItemsProgress) / sessionTotalItems
 * ```
 *
 * - sessionCompletedProgress: 完了済みアイテムの合計（1アイテム完了 = +100）
 * - activeItemsProgress: アップロード中/待機中アイテムの現在進捗の合計
 * - sessionTotalItems: セッション開始からの累計アイテム数
 *
 * ### 状態遷移
 * | イベント                 | sessionTotalItems    | sessionCompletedProgress |
 * |--------------------------|----------------------|--------------------------|
 * | ファイル追加             | += 追加数            | 変化なし                 |
 * | アップロード完了         | 変化なし             | += 100                   |
 * | アイテム削除（未完了）   | -= 1                 | 変化なし                 |
 * | アイテム削除（完了済み） | 変化なし             | 変化なし                 |
 * | 全アップロード完了       | = 0 にリセット       | = 0 にリセット           |
 */
import { ref, computed } from "vue";
import type { UploadItem, UploadResponse } from "../types/upload";
import { useAuth } from "./useAuth";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const MAX_CONCURRENT_UPLOADS = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Shared state (singleton pattern)
const queue = ref<UploadItem[]>([]);
const isProcessing = ref(false);
const onCompleteCallbacks: Set<() => void> = new Set();

// Session-based progress tracking (see documentation above)
const sessionTotalItems = ref(0);
const sessionCompletedProgress = ref(0);

export function useUpload() {
  const { refreshAccessToken, authEnabled } = useAuth();

  const pendingCount = computed(
    () => queue.value.filter((item) => item.status === "pending").length
  );

  const uploadingCount = computed(
    () => queue.value.filter((item) => item.status === "uploading").length
  );

  const completedCount = computed(
    () =>
      queue.value.filter(
        (item) => item.status === "success" || item.status === "duplicate"
      ).length
  );

  const successCount = computed(
    () => queue.value.filter((item) => item.status === "success").length
  );

  const duplicateCount = computed(
    () => queue.value.filter((item) => item.status === "duplicate").length
  );

  const errorCount = computed(
    () => queue.value.filter((item) => item.status === "error").length
  );

  const totalProgress = computed(() => {
    // Use session-based calculation to prevent progress jumping when items complete
    if (sessionTotalItems.value === 0) return 0;

    // Sum progress of all items in the current session (active + completed this session)
    const activeItems = queue.value.filter(
      (item) => item.status === "uploading" || item.status === "pending"
    );
    const activeProgress = activeItems.reduce((acc, item) => acc + item.progress, 0);

    // Total progress = completed items (100% each) + active items progress
    const totalSum = sessionCompletedProgress.value + activeProgress;
    return Math.round(totalSum / sessionTotalItems.value);
  });

  const hasItems = computed(() => queue.value.length > 0);

  const isUploading = computed(
    () => uploadingCount.value > 0 || pendingCount.value > 0
  );

  function addFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    let addedCount = 0;

    for (const file of fileArray) {
      // Only accept PNG files
      if (file.type !== "image/png") {
        console.warn(`Skipping non-PNG file: ${file.name}`);
        continue;
      }

      // Check file size (10MB limit)
      if (file.size > MAX_FILE_SIZE) {
        console.warn(`Skipping file exceeding 10MB limit: ${file.name}`);
        const item: UploadItem = {
          id: crypto.randomUUID(),
          file,
          status: "error",
          progress: 0,
          error: "File size exceeds 10MB limit",
        };
        queue.value.push(item);
        continue;
      }

      const item: UploadItem = {
        id: crypto.randomUUID(),
        file,
        status: "pending",
        progress: 0,
      };

      queue.value.push(item);
      addedCount++;
    }

    // Update session total when adding new items
    if (addedCount > 0) {
      sessionTotalItems.value += addedCount;
    }

    processQueue();
  }

  async function processQueue() {
    if (isProcessing.value) return;
    isProcessing.value = true;

    while (true) {
      const pending = queue.value.filter((item) => item.status === "pending");
      const uploading = queue.value.filter(
        (item) => item.status === "uploading"
      );

      if (pending.length === 0 && uploading.length === 0) {
        break;
      }

      // Start new uploads up to max concurrent limit
      const slotsAvailable = MAX_CONCURRENT_UPLOADS - uploading.length;
      const toStart = pending.slice(0, slotsAvailable);

      if (toStart.length > 0) {
        await Promise.all(toStart.map((item) => uploadFile(item)));
      } else {
        // Wait a bit before checking again
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    isProcessing.value = false;

    // Reset session tracking when all uploads complete
    sessionTotalItems.value = 0;
    sessionCompletedProgress.value = 0;

    // Notify all callbacks that uploads are complete
    if (completedCount.value > 0 || errorCount.value > 0) {
      onCompleteCallbacks.forEach((cb) => cb());
    }
  }

  async function uploadFile(item: UploadItem) {
    item.status = "uploading";
    item.progress = 0;

    try {
      const formData = new FormData();
      formData.append("file", item.file);

      const xhr = new XMLHttpRequest();
      item.xhr = xhr; // Store XHR for potential abort

      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            item.progress = Math.round((event.loaded / event.total) * 100);
          }
        });

        xhr.addEventListener("load", async () => {
          item.xhr = undefined; // Clear XHR reference
          if (xhr.status === 401 && authEnabled.value) {
            // Try to refresh token and retry
            const refreshed = await refreshAccessToken();
            if (refreshed) {
              // Reset and let queue processor retry
              item.status = "pending";
              item.progress = 0;
              resolve();
              return;
            }
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result: UploadResponse = JSON.parse(xhr.responseText);
              if ("duplicate" in result && result.duplicate) {
                item.status = "duplicate";
                item.result = {
                  imageId: result.existingImage.id,
                  s3Url: result.existingImage.s3Url,
                  duplicate: true,
                };
                item.completedAt = Date.now();
                sessionCompletedProgress.value += 100;
              } else if ("image" in result) {
                item.status = "success";
                item.result = {
                  imageId: result.image.id,
                  s3Url: result.image.s3Url,
                };
                item.completedAt = Date.now();
                sessionCompletedProgress.value += 100;
              }
              item.progress = 100;
            } catch {
              item.status = "error";
              item.error = "Invalid response";
              sessionCompletedProgress.value += 100;
            }
          } else {
            item.status = "error";
            // Handle nginx 413 (Request Entity Too Large)
            if (xhr.status === 413) {
              item.error = "File size exceeds 10MB limit";
            } else {
              try {
                const errorResult = JSON.parse(xhr.responseText);
                item.error = errorResult.error || "Upload failed";
              } catch {
                item.error = `HTTP ${xhr.status}`;
              }
            }
            sessionCompletedProgress.value += 100;
          }
          resolve();
        });

        xhr.addEventListener("error", () => {
          item.xhr = undefined;
          item.status = "error";
          item.error = "Network error";
          sessionCompletedProgress.value += 100;
          reject(new Error("Network error"));
        });

        xhr.addEventListener("abort", () => {
          item.xhr = undefined;
          // Don't set error status here - cancelUpload handles removal
          resolve();
        });

        xhr.open("POST", `${API_BASE}/api/upload`);
        xhr.withCredentials = true;
        xhr.send(formData);
      });
    } catch (error) {
      item.xhr = undefined;
      item.status = "error";
      item.error = error instanceof Error ? error.message : "Upload failed";
      sessionCompletedProgress.value += 100;
    }
  }

  function removeItem(id: string) {
    const item = queue.value.find((item) => item.id === id);
    if (item) {
      // Abort XHR if upload is in progress
      if (item.xhr) {
        item.xhr.abort();
      }
      // Adjust session tracking when removing an item
      if (item.status === "pending" || item.status === "uploading") {
        // Item hasn't completed yet, reduce session total
        sessionTotalItems.value = Math.max(0, sessionTotalItems.value - 1);
      }
      queue.value = queue.value.filter((i) => i.id !== id);
    }
  }

  function clearCompleted() {
    queue.value = queue.value.filter(
      (item) => item.status !== "success" && item.status !== "duplicate"
    );
  }

  function clearAll() {
    queue.value = [];
  }

  function retryFailed() {
    for (const item of queue.value) {
      if (item.status === "error") {
        item.status = "pending";
        item.progress = 0;
        item.error = undefined;
      }
    }
    processQueue();
  }

  function onComplete(callback: () => void) {
    onCompleteCallbacks.add(callback);
    return () => {
      onCompleteCallbacks.delete(callback);
    };
  }

  return {
    queue,
    isUploading,
    isProcessing,
    pendingCount,
    uploadingCount,
    completedCount,
    successCount,
    duplicateCount,
    errorCount,
    totalProgress,
    hasItems,
    addFiles,
    removeItem,
    clearCompleted,
    clearAll,
    retryFailed,
    onComplete,
  };
}
