import { fileURLToPath } from "node:url";
import {
  themeInitScriptEntry,
  themeScriptNonceFromEnv,
} from "./composables/theme";

export default defineNuxtConfig({
  css: [
    fileURLToPath(new URL("./assets/css/tokens.css", import.meta.url)),
    fileURLToPath(new URL("./assets/css/app-shell.css", import.meta.url)),
  ],
  app: {
    head: {
      script: [themeInitScriptEntry(themeScriptNonceFromEnv())],
    },
  },
});
