import type { MetadataWasmModule } from "./metadataParser";
import { loadMetadataWasm, setMetadataWasm } from "./metadataParser";

type LoaderState = {
  loading?: Promise<MetadataWasmModule>;
  loaded?: MetadataWasmModule;
};

const state: LoaderState = {};

export interface MetadataWasmLoaderOptions {
  init?: () => Promise<MetadataWasmModule>;
}

async function defaultInit(): Promise<MetadataWasmModule> {
  const initModule = await import("../wasm/metadata/rta_metadata_wasm.js");
  await initModule.default();
  return {
    parse_metadata_with_limits: initModule.parse_metadata_with_limits,
    parse_metadata_batch: initModule.parse_metadata_batch,
  };
}

export async function ensureMetadataWasmLoaded(
  options: MetadataWasmLoaderOptions = {},
): Promise<MetadataWasmModule> {
  if (state.loaded) return state.loaded;
  if (!state.loading) {
    const init = options.init ?? defaultInit;
    state.loading = init().then((module) => {
      setMetadataWasm(module);
      state.loaded = module;
      return module;
    });
  }
  return state.loading;
}

export async function preloadMetadataWasm(
  options: MetadataWasmLoaderOptions = {},
): Promise<void> {
  await loadMetadataWasm(async () => {
    const init = options.init ?? defaultInit;
    const module = await init();
    state.loaded = module;
    return module;
  });
}
