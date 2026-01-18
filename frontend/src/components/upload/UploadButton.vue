<script setup lang="ts">
/**
 * UploadButton - アップロードボタンとモーダルの状態管理
 *
 * ## ボタンアイコンの状態
 * | 条件                                                    | アイコン | 色               |
 * |---------------------------------------------------------|----------|------------------|
 * | アップロード中 (isUploading)                            | spinner  | info (青)        |
 * | 完了表示中 + エラーあり (lastBatchHadErrors)            | warning  | warn (黄)        |
 * | 完了表示中 + エラーなし                                 | check    | success (緑)     |
 * | それ以外                                                | upload   | secondary (グレー)|
 *
 * ## showCompletionStatus の状態遷移
 * | イベント                           | 変化                        |
 * |------------------------------------|-----------------------------|
 * | モーダルを開く                     | false にリセット            |
 * | アップロード完了（モーダル閉）     | true に設定                 |
 * | アップロード完了（モーダル開）     | 変化なし                    |
 * | 成功完了後 10秒経過                | false にリセット            |
 * | エラー完了後 10秒経過              | 変化なし（警告を維持）      |
 *
 * ## トースト通知
 * - アップロードバッチが完了したとき（onComplete）に常に表示
 * - モーダルの開閉状態に関係なく表示
 * - カウントは「そのバッチで処理されたアイテム数」を表示
 *
 * ## 画面更新 (emit("uploaded"))
 * | イベント                         | 条件                          | 動作                          |
 * |----------------------------------|-------------------------------|-------------------------------|
 * | アップロード完了（モーダル閉）   | 成功が1件以上                 | 即座に emit                   |
 * | アップロード完了（モーダル開）   | 成功が1件以上                 | hadSuccessWhileOpen = true    |
 * | モーダルを閉じる                 | hadSuccessWhileOpen === true  | emit して画面更新             |
 *
 * ## 内部フラグ一覧
 * | フラグ                       | 用途                                               |
 * |------------------------------|----------------------------------------------------|
 * | showCompletionStatus         | ボタンに完了状態アイコンを表示するか               |
 * | lastBatchHadErrors           | 最後のバッチでエラーがあったか（アイコン種類判定） |
 * | hadSuccessWhileOpen          | モーダル開中に成功があったか（閉じた時の更新用）   |
 * | lastBatchSuccessCount        | 最後のバッチの成功カウント（トースト表示用）       |
 * | lastBatchDuplicateCount      | 最後のバッチの重複カウント（トースト表示用）       |
 * | lastBatchErrorCount          | 最後のバッチのエラーカウント（トースト表示用）     |
 * | previousTotalSuccessCount    | 前回バッチ完了時点の累計成功数（差分計算用）       |
 * | previousTotalDuplicateCount  | 前回バッチ完了時点の累計重複数（差分計算用）       |
 * | previousTotalErrorCount      | 前回バッチ完了時点の累計エラー数（差分計算用）     |
 */
import { ref, computed, watch, onUnmounted } from "vue";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import UploadPanel from "./UploadPanel.vue";
import { useUpload } from "../../composables/useUpload";
import { useBackButtonClose } from "../../composables/useBackButtonClose";

const emit = defineEmits<{
  uploaded: [];
}>();

const toast = useToast();
const {
  isUploading,
  successCount,
  duplicateCount,
  errorCount,
  onComplete,
} = useUpload();

// Dialog state
const dialogVisible = ref(false);

// Close dialog on browser back button
useBackButtonClose(dialogVisible, "upload", () => {
  dialogVisible.value = false;
});

// Flag to show completion status on button (resets after 10 seconds or when modal opens)
const showCompletionStatus = ref(false);

// Track counts from previous batch completion for calculating batch-specific counts
// These are updated after each batch completes
const previousTotalSuccessCount = ref(0);
const previousTotalDuplicateCount = ref(0);
const previousTotalErrorCount = ref(0);

// Track if uploads completed while modal was open (for refresh on close)
const hadSuccessWhileOpen = ref(false);

// Track if the last completed batch had errors (for button icon state)
const lastBatchHadErrors = ref(false);

// Upload button appearance based on state
const buttonIcon = computed(() => {
  if (isUploading.value) return "pi pi-spin pi-spinner";
  // Show status icon only when showCompletionStatus is true
  if (showCompletionStatus.value) {
    if (lastBatchHadErrors.value) return "pi pi-exclamation-triangle";
    return "pi pi-check-circle";
  }
  return "pi pi-upload";
});
const buttonSeverity = computed(() => {
  if (isUploading.value) return "info";
  // Show status color only when showCompletionStatus is true
  if (showCompletionStatus.value) {
    if (lastBatchHadErrors.value) return "warn";
    return "success";
  }
  return "secondary";
});

// Handle dialog open/close
watch(dialogVisible, (visible) => {
  if (visible) {
    // Reset warning icon when modal is opened (user acknowledged the status)
    showCompletionStatus.value = false;
    hadSuccessWhileOpen.value = false;
  } else {
    // Dialog closed - emit uploaded if there were successful uploads while open
    if (hadSuccessWhileOpen.value) {
      hadSuccessWhileOpen.value = false;
      emit("uploaded");
    }
  }
});

// Timer for auto-clearing completed uploads
let autoClearTimer: ReturnType<typeof setTimeout> | null = null;

// Register upload complete callback
const unregisterComplete = onComplete(() => {
  // Calculate batch-specific counts (difference from previous batch completion)
  const batchSuccessCount = successCount.value - previousTotalSuccessCount.value;
  const batchDuplicateCount = duplicateCount.value - previousTotalDuplicateCount.value;
  const batchErrorCount = errorCount.value - previousTotalErrorCount.value;
  // Treat duplicates as errors for toast display
  const batchFailedCount = batchDuplicateCount + batchErrorCount;

  // Update previous totals for next batch
  previousTotalSuccessCount.value = successCount.value;
  previousTotalDuplicateCount.value = duplicateCount.value;
  previousTotalErrorCount.value = errorCount.value;

  // Show toast notification for this batch (regardless of modal state)
  if (batchSuccessCount > 0 || batchFailedCount > 0) {
    const messages: string[] = [];
    if (batchSuccessCount > 0) {
      messages.push(`${batchSuccessCount} image${batchSuccessCount !== 1 ? "s" : ""} uploaded`);
    }
    if (batchDuplicateCount > 0) {
      messages.push(`${batchDuplicateCount} duplicate${batchDuplicateCount !== 1 ? "s" : ""}`);
    }
    if (batchErrorCount > 0) {
      messages.push(`${batchErrorCount} failed`);
    }

    toast.add({
      severity: batchSuccessCount > 0 && batchFailedCount === 0 ? "success" : batchFailedCount > 0 ? "warn" : "info",
      summary: "Upload Complete",
      detail: messages.join(", "),
      life: 10000,
    });
  }

  if (dialogVisible.value) {
    // Modal is open - track for refresh on close
    if (batchSuccessCount > 0) {
      hadSuccessWhileOpen.value = true;
    }
    // Don't change button status while modal is open
  } else {
    // Emit uploaded event if new images were uploaded
    if (batchSuccessCount > 0) {
      emit("uploaded");
    }

    // Show completion status on button only when modal is closed
    showCompletionStatus.value = true;
    lastBatchHadErrors.value = batchFailedCount > 0;

    // Only auto-reset after 10 seconds if there are no errors/duplicates in this batch
    // Keep warning icon visible until user opens the modal (acknowledges)
    if (batchFailedCount === 0) {
      if (autoClearTimer) {
        clearTimeout(autoClearTimer);
      }
      autoClearTimer = setTimeout(() => {
        showCompletionStatus.value = false;
        autoClearTimer = null;
      }, 10000);
    }
  }
});

onUnmounted(() => {
  unregisterComplete();
  if (autoClearTimer) {
    clearTimeout(autoClearTimer);
  }
});

function openDialog() {
  dialogVisible.value = true;
}

// Expose openDialog for parent components (e.g., drag and drop)
defineExpose({ openDialog });
</script>

<template>
  <Button
    :icon="buttonIcon"
    :severity="buttonSeverity"
    variant="outlined"
    aria-label="Upload"
    @click="dialogVisible = true"
  />

  <Dialog
    v-model:visible="dialogVisible"
    header="Upload Images"
    :modal="true"
    :dismissable-mask="true"
    :style="{ width: '500px', maxWidth: '90vw' }"
  >
    <UploadPanel />
  </Dialog>
</template>
