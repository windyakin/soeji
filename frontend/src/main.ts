import { createApp } from "vue";
import PrimeVue from "primevue/config";
import Aura from "@primevue/themes/aura";
import "primeicons/primeicons.css";
import "./style.css";
import App from "./App.vue";
import { registerSW } from "virtual:pwa-register";

const app = createApp(App);

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: ".dark-mode",
    },
  },
});

app.mount("#app");

// Register service worker
const updateSW = registerSW({
  onNeedRefresh() {
    if (confirm("新しいバージョンが利用可能です。更新しますか？")) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log("アプリがオフラインで使用できるようになりました");
  },
});
