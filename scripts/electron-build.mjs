import { build } from "esbuild";
import { execSync } from "node:child_process";

const ELECTRON_ENTRY = "electron/main.ts";
const PRELOAD_ENTRY = "electron/preload.ts";
const OUTDIR = "dist-electron";

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
  minify: true,
  treeShaking: true,
};

async function main() {
  console.log("\x1b[36m[electron-build]\x1b[0m Building renderer (Vite)…");
  execSync("pnpm exec vue-tsc && pnpm exec vite build", { stdio: "inherit" });

  console.log(
    "\x1b[36m[electron-build]\x1b[0m Building main process (esbuild)…",
  );
  await build({
    ...shared,
    entryPoints: [ELECTRON_ENTRY],
  });

  console.log(
    "\x1b[36m[electron-build]\x1b[0m Building preload script (esbuild)…",
  );
  await build({
    ...shared,
    entryPoints: [PRELOAD_ENTRY],
  });

  console.log(
    "\x1b[36m[electron-build]\x1b[0m Packaging with electron-builder…",
  );
  execSync("pnpm exec electron-builder", {
    stdio: "inherit",
  });

  console.log("\x1b[32m[electron-build]\x1b[0m Done! Output in ./release/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
