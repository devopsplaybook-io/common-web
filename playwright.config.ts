import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { FIXTURE_ORIGIN, LAYER_ORIGIN } from "./e2e/palettes";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const packedDirectory = process.env.COMMON_WEB_PACKED_DIR;

if (!packedDirectory) {
  throw new Error(
    "COMMON_WEB_PACKED_DIR is not set. Run `npm run test:e2e` (it packs the package and sets the variable).",
  );
}

const fixturePort = new URL(FIXTURE_ORIGIN).port;
const layerPort = new URL(LAYER_ORIGIN).port;
const viteBin = path.join(rootDirectory, "node_modules/.bin/vite");
const nitroServer = path.join(
  rootDirectory,
  "playground/.output/server/index.mjs",
);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: "disabled",
      caret: "hide",
      scale: "css",
      stylePath: path.join(rootDirectory, "e2e/snapshot.css"),
    },
  },
  use: {
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 1,
    locale: "en-US",
    timezoneId: "UTC",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: ["--font-render-hinting=none", "--disable-lcd-text"],
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      // Plain Vite + Vue fixture (no Nuxt, no common-web layer) importing the
      // components from the packed tarball. Run the binary directly: an `npx`
      // wrapper would survive as a grandchild and hold the server's pipes open
      // after Playwright kills the shell, hanging the run on teardown.
      command: `"${viteBin}" tests/theme-host --port ${fixturePort} --strictPort --host 127.0.0.1`,
      url: `${FIXTURE_ORIGIN}/tokenless-light.html`,
      env: { COMMON_WEB_PACKED_DIR: packedDirectory },
      cwd: rootDirectory,
      reuseExistingServer: true,
      gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
      timeout: 120_000,
    },
    {
      // Built Nuxt playground (the layer host). `npm run build` produces
      // playground/.output; running its Node server avoids the `nuxi preview`
      // (and `npx`) process tree that Playwright cannot reap.
      command: `node "${nitroServer}"`,
      url: `${LAYER_ORIGIN}/theme-harness`,
      env: { PORT: layerPort, HOST: "127.0.0.1" },
      cwd: rootDirectory,
      reuseExistingServer: true,
      gracefulShutdown: { signal: "SIGTERM", timeout: 2_000 },
      timeout: 180_000,
    },
  ],
});
