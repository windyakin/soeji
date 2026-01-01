import { ref } from "vue";
import { registerSW } from "virtual:pwa-register";

const needRefresh = ref(false);
const offlineReady = ref(false);

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function usePwaUpdate() {
  // Initialize only once
  if (!updateSW) {
    updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        needRefresh.value = true;
      },
      onOfflineReady() {
        offlineReady.value = true;
      },
      onRegisteredSW(_swUrl, registration) {
        // Check for updates every 60 seconds
        if (registration) {
          setInterval(() => {
            registration.update();
          }, 60 * 1000);
        }
      },
    });
  }

  async function updateServiceWorker() {
    if (updateSW) {
      await updateSW(true);
    }
  }

  function dismissUpdate() {
    needRefresh.value = false;
  }

  function dismissOfflineReady() {
    offlineReady.value = false;
  }

  return {
    needRefresh,
    offlineReady,
    updateServiceWorker,
    dismissUpdate,
    dismissOfflineReady,
  };
}
