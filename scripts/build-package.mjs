import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  rmdirSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "common-web-build-"));
const scopeDirectory = resolve("node_modules/@devopsplaybook.io");
const installedPackage = join(scopeDirectory, "common-web");

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryDirectory],
    { encoding: "utf8" },
  );
  const [{ filename, files }] = JSON.parse(packOutput);
  const packageFiles = new Set(files.map(({ path }) => path));
  const requiredFiles = [
    "nuxt.config.ts",
    "assets/css/tokens.css",
    "assets/css/app-shell.css",
    "components/Loading.vue",
    "components/AlertMessages.vue",
    "components/AppNavigation.vue",
    "components/OfflineBanner.vue",
    "composables/EventBus.ts",
    "services/AuthService.ts",
    "stores/AuthenticationStore.ts",
    "README.md",
    "CHANGELOG.md",
    "CONTRIBUTING.md",
    "LICENSE",
  ];
  const missingFiles = requiredFiles.filter((path) => !packageFiles.has(path));

  if (missingFiles.length > 0) {
    throw new Error(`npm pack is missing required files: ${missingFiles.join(", ")}`);
  }

  const forbiddenFiles = [...packageFiles].filter(
    (path) =>
      path.startsWith(".github/") ||
      path.startsWith("tests/") ||
      path.startsWith("playground/") ||
      path.startsWith("scripts/") ||
      path.startsWith("coverage/"),
  );

  if (forbiddenFiles.length > 0) {
    throw new Error(`npm pack contains development files: ${forbiddenFiles.join(", ")}`);
  }

  const extractedPackage = join(temporaryDirectory, "package");
  execFileSync("tar", ["-xzf", join(temporaryDirectory, filename), "-C", temporaryDirectory]);
  mkdirSync(scopeDirectory, { recursive: true });
  if (existsSync(installedPackage)) {
    throw new Error(`${installedPackage} already exists; refusing to replace it`);
  }
  symlinkSync(extractedPackage, installedPackage, "dir");
  execFileSync("npx", ["nuxi", "build", "playground"], { stdio: "inherit" });
} finally {
  if (existsSync(installedPackage)) rmSync(installedPackage);
  if (existsSync(scopeDirectory) && readdirSync(scopeDirectory).length === 0) {
    rmdirSync(scopeDirectory);
  }
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
