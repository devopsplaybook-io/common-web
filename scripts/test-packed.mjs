import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "common-web-packed-"));

try {
  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", temporaryDirectory],
    { encoding: "utf8" },
  );
  const [{ filename }] = JSON.parse(packOutput);
  const packageTarball = join(temporaryDirectory, filename);

  execFileSync("tar", ["-xzf", packageTarball, "-C", temporaryDirectory]);
  const extractedPackage = join(temporaryDirectory, "package");
  symlinkSync(resolve("node_modules"), join(extractedPackage, "node_modules"), "dir");
  execFileSync(
    resolve("node_modules/.bin/vitest"),
    ["run", "--coverage"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        COMMON_WEB_PACKED_DIR: join(temporaryDirectory, "package"),
      },
      stdio: "inherit",
    },
  );
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
