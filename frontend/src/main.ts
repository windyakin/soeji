import { createApp } from "vue";
import PrimeVue from "primevue/config";
import ConfirmationService from "primevue/confirmationservice";
import ToastService from "primevue/toastservice";
import Aura from "@primevue/themes/aura";
import "primeicons/primeicons.css";
import "primeflex/primeflex.css";
import "./style.css";
import App from "./App.vue";
import router from "./router";

const app = createApp(App);

app.use(router);
app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: ".dark-mode",
    },
  },
});
app.use(ConfirmationService);
app.use(ToastService);

app.mount("#app");
