import { fileURLToPath } from "node:url";
import { THEME_INIT_SCRIPT } from "./composables/theme";

export default defineNuxtConfig({
  css: [
    fileURLToPath(new URL("./assets/css/tokens.css", import.meta.url)),
    fileURLToPath(new URL("./assets/css/app-shell.css", import.meta.url)),
  ],
  app: {
    head: {
      script: [{ key: "common-web-theme", innerHTML: THEME_INIT_SCRIPT }],
    },
  },
});
