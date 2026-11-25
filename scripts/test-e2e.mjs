import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";

// Pack the package exactly as consumers receive it, so the fixture imports
// the published file set (this mirrors scripts/test-packed.mjs).
const cacheDirectory = join(process.cwd(), "node_modules", ".cache", "common-web-e2e");
const packedDirectory = join(cacheDirectory, "package");

rmSync(cacheDirectory, { recursive: true, force: true });
mkdirSync(cacheDirectory, { recursive: true });

let packageTarball;
try {
  const packOutput = spawnSync(
    "npm",
    ["pack", "--json", "--pack-destination", cacheDirectory],
    { encoding: "utf8" },
  );
  if (packOutput.status !== 0) {
    process.stderr.write(packOutput.stderr ?? "");
    throw new Error("npm pack failed");
  }
  const [{ filename }] = JSON.parse(packOutput.stdout);
  packageTarball = join(cacheDirectory, filename);

  const extract = spawnSync("tar", ["-xzf", packageTarball, "-C", cacheDirectory], {
    stdio: "inherit",
  });
  if (extract.status !== 0) throw new Error("extracting the packaged tarball failed");
  rmSync(packageTarball, { force: true });

  symlinkSync(resolve("node_modules"), join(packedDirectory, "node_modules"), "dir");
} catch (error) {
  rmSync(cacheDirectory, { recursive: true, force: true });
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

if (!existsSync(resolve("playground/.output/server/index.mjs"))) {
  rmSync(cacheDirectory, { recursive: true, force: true });
  console.error(
    "playground/.output is missing. Run `npm run build` before `npm run test:e2e`.",
  );
  process.exit(1);
}

// The harness owns both host servers instead of letting Playwright's webServer
// plugin spawn them: Playwright kills a webServer with `kill(-pid)`, which is
// unavailable in some sandboxes, so a lingering server would hang teardown.
// Here each server is a direct child that we stop by PID.
const fixturePort = process.env.THEME_FIXTURE_PORT ?? "4310";
const layerPort = process.env.THEME_LAYER_PORT ?? "4311";
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
const layerOrigin = `http://127.0.0.1:${layerPort}`;

const servers = [];

function startServer(name, script, args, env) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  // A failed `kill` is reported both by throwing and via an 'error' event.
  child.on("error", () => {});
  return { name, child };
}

async function waitForServer(server, url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(
        `${server.name} exited with code ${server.child.exitCode} before ${url} became available`,
      );
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`${server.name} did not become available at ${url}`);
}

// Best effort: a locked-down sandbox may deny killing even a direct child, so
// never let shutdown mask the test result or block the run.
async function stopServer({ child }) {
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      child.kill(signal);
    } catch {
      return;
    }
    await new Promise((done) => {
      const timer = setTimeout(done, 3_000);
      child.once("exit", () => {
        clearTimeout(timer);
        done();
      });
    });
  }
}

async function main() {
  const fixture = startServer(
    "theme-host fixture",
    resolve("node_modules/.bin/vite"),
    ["tests/theme-host", "--port", fixturePort, "--strictPort", "--host", "127.0.0.1"],
    { COMMON_WEB_PACKED_DIR: packedDirectory },
  );
  const layer = startServer(
    "playground server",
    resolve("playground/.output/server/index.mjs"),
    [],
    { PORT: layerPort, HOST: "127.0.0.1" },
  );
  servers.push(fixture, layer);

  await waitForServer(fixture, `${fixtureOrigin}/tokenless-light.html`);
  await waitForServer(layer, `${layerOrigin}/theme-harness`);

  const result = spawnSync(
    resolve("node_modules/.bin/playwright"),
    ["test", ...process.argv.slice(2)],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        COMMON_WEB_PACKED_DIR: packedDirectory,
        THEME_FIXTURE_PORT: fixturePort,
        THEME_LAYER_PORT: layerPort,
      },
    },
  );
  return result.status ?? 1;
}

let exitCode = 1;
try {
  exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  await Promise.all(servers.map((server) => stopServer(server)));
  if (exitCode !== 0) rmSync(cacheDirectory, { recursive: true, force: true });
}
process.exit(exitCode);
