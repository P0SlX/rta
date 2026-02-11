/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

declare module "*rta_metadata_wasm.js" {
  export function parse_metadata(bytes: Uint8Array): unknown;
  export function parse_metadata_with_limits(
    bytes: Uint8Array,
    maxTextBytes: number,
    maxCoverBytes: number,
  ): unknown;
  export function parse_metadata_batch(
    buffers: Array<unknown>,
    maxTextBytes: number,
    maxCoverBytes: number,
  ): Array<unknown>;
  const init: () => Promise<unknown>;
  export default init;
}
