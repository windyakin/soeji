import { ref, computed, onMounted } from "vue";

// BeforeInstallPromptEvent の型定義
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// グローバル状態（シングルトン）
const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isInstallable = ref(false);
const isInstalled = ref(false);
const isIos = ref(false);
const isStandalone = ref(false);
const isInitialized = ref(false);

// iOS Safari でホーム画面に追加する手順を表示するか
const showIosInstallGuide = ref(false);

function detectPlatform() {
  // iOS検出
  const userAgent = navigator.userAgent.toLowerCase();
  isIos.value =
    /iphone|ipad|ipod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // スタンドアロンモード検出（PWAとして起動されているか）
  isStandalone.value =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;

  // インストール済みの判定
  isInstalled.value = isStandalone.value;
}

function setupInstallPromptListener() {
  // beforeinstallpromptイベントをキャッチ
  window.addEventListener("beforeinstallprompt", (e: Event) => {
    e.preventDefault();
    deferredPrompt.value = e as BeforeInstallPromptEvent;
    isInstallable.value = true;
  });

  // appinstalledイベント（インストール完了時）
  window.addEventListener("appinstalled", () => {
    deferredPrompt.value = null;
    isInstallable.value = false;
    isInstalled.value = true;
  });
}

function initialize() {
  if (isInitialized.value) return;

  detectPlatform();
  setupInstallPromptListener();
  isInitialized.value = true;
}

export function usePwaInstall() {
  onMounted(() => {
    initialize();
  });

  // インストール可能かどうか（iOS以外でプロンプトが利用可能、またはiOSでまだ未インストール）
  const canInstall = computed(() => {
    if (isInstalled.value) return false;
    if (isIos.value) return !isStandalone.value;
    return isInstallable.value;
  });

  // インストールプロンプトを表示
  async function promptInstall(): Promise<boolean> {
    if (isIos.value) {
      // iOSの場合はガイドを表示
      showIosInstallGuide.value = true;
      return false;
    }

    if (!deferredPrompt.value) {
      return false;
    }

    try {
      await deferredPrompt.value.prompt();
      const { outcome } = await deferredPrompt.value.userChoice;

      if (outcome === "accepted") {
        deferredPrompt.value = null;
        isInstallable.value = false;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  function dismissIosGuide() {
    showIosInstallGuide.value = false;
  }

  return {
    // 状態
    canInstall,
    isInstalled,
    isIos,
    isStandalone,
    showIosInstallGuide,

    // アクション
    promptInstall,
    dismissIosGuide,
  };
}
