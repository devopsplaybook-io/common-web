import { fileURLToPath } from "node:url";

export default defineNuxtConfig({
  css: [
    fileURLToPath(new URL("./assets/css/tokens.css", import.meta.url)),
    fileURLToPath(new URL("./assets/css/app-shell.css", import.meta.url)),
  ],
});
