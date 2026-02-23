import { build } from "esbuild";
import { execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const ELECTRON_ENTRY = "electron/main.ts";
const PRELOAD_ENTRY = "electron/preload.ts";
const OUTDIR = "dist-electron";

async function main() {
  console.log("\x1b[36m[electron-preview]\x1b[0m Building renderer (Vite)…");
  execSync("pnpm exec vite build", { stdio: "inherit" });

  console.log(
    "\x1b[36m[electron-preview]\x1b[0m Building Electron files (esbuild)…",
  );

  /** @type {import("esbuild").BuildOptions} */
  const shared = {
    bundle: true,
    platform: "node",
    format: "cjs",
    outdir: OUTDIR,
    outExtension: { ".js": ".cjs" },
    external: ["electron"],
    target: "node22",
    sourcemap: false,
  };

  await build({ ...shared, entryPoints: [ELECTRON_ENTRY] });
  await build({ ...shared, entryPoints: [PRELOAD_ENTRY] });

  console.log("\x1b[36m[electron-preview]\x1b[0m Launching Electron…");

  const child = spawn(String(electronPath), ["."], {
    stdio: "inherit",
  });

  child.on("close", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
