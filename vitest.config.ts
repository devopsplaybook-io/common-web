import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

const packedPackage = process.env.COMMON_WEB_PACKED_DIR;

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: packedPackage
      ? [
          {
            find: /^@devopsplaybook\.io\/common-web/,
            replacement: packedPackage,
          },
        ]
      : [],
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      allowExternal: true,
      include: packedPackage
        ? [
            resolve(packedPackage, "composables/**/*.ts"),
            resolve(packedPackage, "services/**/*.ts"),
            resolve(packedPackage, "stores/**/*.ts"),
          ]
        : ["composables/*.ts", "services/*.ts", "stores/*.ts"],
      reporter: ["text", "json", "clover"],
    },
  },
});
