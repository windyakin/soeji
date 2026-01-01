import { createApp } from "vue";
import PrimeVue from "primevue/config";
import ConfirmationService from "primevue/confirmationservice";
import Aura from "@primevue/themes/aura";
import "primeicons/primeicons.css";
import "./style.css";
import App from "./App.vue";

const app = createApp(App);

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: ".dark-mode",
    },
  },
});
app.use(ConfirmationService);

app.mount("#app");
