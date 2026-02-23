import { context } from "esbuild";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const ELECTRON_ENTRY = "electron/main.ts";
const PRELOAD_ENTRY = "electron/preload.ts";
const OUTDIR = "dist-electron";

/** @type {import("node:child_process").ChildProcess | null} */
let electronProcess = null;

function startElectron(/** @type {string} */ viteUrl) {
  if (electronProcess) {
    electronProcess.removeAllListeners();
    electronProcess.kill();
    electronProcess = null;
  }

  electronProcess = spawn(String(electronPath), ["."], {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: viteUrl,
    },
  });

  electronProcess.on("close", (code) => {
    if (code !== null) {
      process.exit(code);
    }
  });
}

/**
 * @param {string} label
 * @param {string} viteUrl
 * @param {() => void} onRebuild
 * @returns {import("esbuild").Plugin}
 */
function rebuildPlugin(label, viteUrl, onRebuild) {
  let isFirstBuild = true;
  return {
    name: `electron-${label}`,
    setup(pluginBuild) {
      pluginBuild.onEnd((result) => {
        if (result.errors.length > 0) return;
        if (isFirstBuild) {
          isFirstBuild = false;
          return;
        }
        console.log(`\x1b[36m[electron]\x1b[0m ${label} rebuilt, restarting…`);
        onRebuild();
      });
    },
  };
}

async function main() {
  // 1. Start Vite dev server
  const vite = await createServer({ configFile: "vite.config.ts" });
  await vite.listen();

  const resolvedUrl = vite.resolvedUrls?.local?.[0] ?? "http://localhost:5173/";
  console.log(`\x1b[36m[electron]\x1b[0m Vite dev server at ${resolvedUrl}`);

  // 2. Shared esbuild options
  /** @type {import("esbuild").BuildOptions} */
  const shared = {
    bundle: true,
    platform: "node",
    format: "cjs",
    outdir: OUTDIR,
    outExtension: { ".js": ".cjs" },
    external: ["electron"],
    target: "node22",
    sourcemap: true,
  };

  const restart = () => startElectron(resolvedUrl);

  // 3. Create esbuild watch contexts
  const mainCtx = await context({
    ...shared,
    entryPoints: [ELECTRON_ENTRY],
    plugins: [rebuildPlugin("main", resolvedUrl, restart)],
  });

  const preloadCtx = await context({
    ...shared,
    entryPoints: [PRELOAD_ENTRY],
    plugins: [rebuildPlugin("preload", resolvedUrl, restart)],
  });

  // 4. Start watching (initial build happens automatically)
  await mainCtx.watch();
  await preloadCtx.watch();

  // 5. Launch Electron after initial build
  startElectron(resolvedUrl);

  // Cleanup on exit
  const cleanup = async () => {
    if (electronProcess) {
      electronProcess.removeAllListeners();
      electronProcess.kill();
    }
    await mainCtx.dispose();
    await preloadCtx.dispose();
    await vite.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
