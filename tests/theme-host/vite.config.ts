import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

// Minimal plain Vite + Vue host: no Nuxt, no common-web layer, and no
// `assets/css/tokens.css`. This is the mode the reported theming bug came from
// (Planner imports the SFCs directly and defines only part of the palette).
const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const packedDirectory = process.env.COMMON_WEB_PACKED_DIR;

if (!packedDirectory) {
  throw new Error(
    "COMMON_WEB_PACKED_DIR is not set. Run the harness through `npm run test:e2e` so it tests the packed tarball.",
  );
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: /^@devopsplaybook\.io\/common-web(?=\/|$)/,
        replacement: packedDirectory,
      },
    ],
    dedupe: ["vue"],
  },
  server: {
    fs: { allow: [resolve(repositoryRoot), packedDirectory] },
  },
});
