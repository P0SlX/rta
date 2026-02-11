export interface MetadataResult {
  title?: string;
  artist?: string;
  album?: string;
  coverMime?: string;
  coverData?: Uint8Array;
  coverType?: number;
  sampleRate?: number;
  bitDepth?: number;
  bitrate?: number;
  channels?: number;
}

export interface MetadataParseOptions {
  maxTextBytes?: number;
  maxCoverBytes?: number;
  maxTagBytes?: number;
  maxFlacBytes?: number;
}

export interface MetadataBatchOptions extends MetadataParseOptions {
  batchSize?: number;
}

export type MetadataWasmModule = {
  parse_metadata_with_limits: (
    bytes: Uint8Array,
    maxTextBytes: number,
    maxCoverBytes: number,
  ) => unknown;
  parse_metadata_batch: (
    buffers: Uint8Array[],
    maxTextBytes: number,
    maxCoverBytes: number,
  ) => unknown[];
};

const DEFAULT_MAX_TEXT_BYTES = 16 * 1024;
const DEFAULT_MAX_COVER_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_TAG_BYTES = 4 * 1024 * 1024;
const DEFAULT_MAX_FLAC_BYTES = 2 * 1024 * 1024;

const ID3_HEADER_SIZE = 10;
const ID3_TAG = 0x494433;
const FLAC_TAG = 0x664c6143;

/**
 * Octets supplémentaires à lire après le tag ID3v2 pour que le parseur WASM puisse localiser
 * le premier en-tête de trame audio MPEG et extraire le taux d'échantillonnage / débit binaire.
 */
const MPEG_FRAME_SCAN_BYTES = 4096;

/**
 * Pour les fichiers qui commencent par une synchronisation MPEG brute (sans ID3v2), nous lisons
 * ce nombre d'octets depuis le début pour trouver l'en-tête de trame + queue ID3v1.
 */
const RAW_MPEG_HEAD_BYTES = 4096;

let wasmModule: MetadataWasmModule | null = null;

export function setMetadataWasm(module: MetadataWasmModule) {
  wasmModule = module;
}

export async function loadMetadataWasm(
  init: () => Promise<MetadataWasmModule>,
): Promise<void> {
  if (wasmModule) return;
  wasmModule = await init();
}

function requireWasm(): MetadataWasmModule {
  if (!wasmModule) {
    throw new Error(
      "WASM metadata parser not loaded. Call loadMetadataWasm() first.",
    );
  }
  return wasmModule;
}

function normalizeMetadata(value: unknown): MetadataResult {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  const coverData = record.coverData;
  return {
    title: typeof record.title === "string" ? record.title : undefined,
    artist: typeof record.artist === "string" ? record.artist : undefined,
    album: typeof record.album === "string" ? record.album : undefined,
    coverMime:
      typeof record.coverMime === "string" ? record.coverMime : undefined,
    coverData: coverData instanceof Uint8Array ? coverData : undefined,
    coverType:
      typeof record.coverType === "number" ? record.coverType : undefined,
    sampleRate:
      typeof record.sampleRate === "number" ? record.sampleRate : undefined,
    bitDepth: typeof record.bitDepth === "number" ? record.bitDepth : undefined,
    bitrate: typeof record.bitrate === "number" ? record.bitrate : undefined,
    channels: typeof record.channels === "number" ? record.channels : undefined,
  };
}

function mergeMetadata(
  primary: MetadataResult,
  fallback: MetadataResult,
): MetadataResult {
  return {
    title: primary.title || fallback.title,
    artist: primary.artist || fallback.artist,
    album: primary.album || fallback.album,
    coverMime: primary.coverMime || fallback.coverMime,
    coverData: primary.coverData || fallback.coverData,
    coverType:
      primary.coverType !== undefined ? primary.coverType : fallback.coverType,
    sampleRate:
      primary.sampleRate !== undefined
        ? primary.sampleRate
        : fallback.sampleRate,
    bitDepth:
      primary.bitDepth !== undefined ? primary.bitDepth : fallback.bitDepth,
    bitrate: primary.bitrate !== undefined ? primary.bitrate : fallback.bitrate,
    channels:
      primary.channels !== undefined ? primary.channels : fallback.channels,
  };
}

function synchsafeToSize(bytes: Uint8Array): number {
  if (bytes.length < 4) return 0;
  return (
    ((bytes[0] & 0x7f) << 21) |
    ((bytes[1] & 0x7f) << 14) |
    ((bytes[2] & 0x7f) << 7) |
    (bytes[3] & 0x7f)
  );
}

function bytesToU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

async function readSlice(
  file: File,
  start: number,
  end: number,
): Promise<Uint8Array> {
  const blob = file.slice(start, end);
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}

async function readHeader(file: File, length: number) {
  const size = Math.min(file.size, length);
  return readSlice(file, 0, size);
}

async function readTail(file: File, length: number) {
  const size = Math.min(file.size, length);
  return readSlice(file, file.size - size, file.size);
}

function isFlacHeader(header: Uint8Array) {
  return header.length >= 4 && bytesToU32BE(header, 0) === FLAC_TAG;
}

function isId3Header(header: Uint8Array) {
  return header.length >= 3 && bytesToU32BE(header, 0) >>> 8 === ID3_TAG;
}

/**
 * Vérifie la présence d'un mot de synchronisation MPEG brut (0xFF suivi de 0xE0+).
 * Cela détecte les fichiers MP3 qui commencent directement par des trames audio (sans ID3v2).
 */
function isMpegSync(header: Uint8Array) {
  return (
    header.length >= 2 && header[0] === 0xff && (header[1] & 0xe0) === 0xe0
  );
}

async function readFlacMetadataPrefix(
  file: File,
  maxFlacBytes: number,
): Promise<Uint8Array> {
  const fileSize = file.size;
  const headerSize = Math.min(4, fileSize, maxFlacBytes);
  if (headerSize < 4) {
    return readSlice(file, 0, headerSize);
  }

  let total = 4;
  let offset = 4;

  while (offset + 4 <= fileSize && total + 4 <= maxFlacBytes) {
    const header = await readSlice(file, offset, offset + 4);
    if (header.length < 4) break;

    const isLast = (header[0] & 0x80) !== 0;
    const length = (header[1] << 16) | (header[2] << 8) | header[3];

    const nextOffset = offset + 4 + length;
    if (nextOffset > fileSize) break;
    if (total + 4 + length > maxFlacBytes) break;

    total += 4 + length;
    offset = nextOffset;

    if (isLast) break;
  }

  return readSlice(file, 0, total);
}

/**
 * Pour les MP3 avec ID3v2 : lire le tag + octets supplémentaires pour que le parseur WASM puisse
 * trouver le premier en-tête de trame MPEG juste après le tag.
 */
function id3HeadReadSize(
  fileSize: number,
  tagSize: number,
  maxTagBytes: number,
): number {
  const withFrame = ID3_HEADER_SIZE + tagSize + MPEG_FRAME_SCAN_BYTES;
  const totalSize = Math.min(fileSize, withFrame);
  return Math.min(totalSize, maxTagBytes);
}

function normalizeLimits(options?: MetadataParseOptions) {
  return {
    maxTextBytes: options?.maxTextBytes ?? DEFAULT_MAX_TEXT_BYTES,
    maxCoverBytes: options?.maxCoverBytes ?? DEFAULT_MAX_COVER_BYTES,
    maxTagBytes: options?.maxTagBytes ?? DEFAULT_MAX_TAG_BYTES,
    maxFlacBytes: options?.maxFlacBytes ?? DEFAULT_MAX_FLAC_BYTES,
  };
}

export async function parseMetadataFromFile(
  file: File,
  options?: MetadataParseOptions,
): Promise<MetadataResult> {
  const wasm = requireWasm();
  const { maxTextBytes, maxCoverBytes, maxTagBytes, maxFlacBytes } =
    normalizeLimits(options);

  const header = await readHeader(file, ID3_HEADER_SIZE);

  // ── FLAC ────────────────────────────────────────────────────────────
  if (isFlacHeader(header)) {
    const flacBytes = await readFlacMetadataPrefix(file, maxFlacBytes);
    return normalizeMetadata(
      wasm.parse_metadata_with_limits(flacBytes, maxTextBytes, maxCoverBytes),
    );
  }

  // ── MP3 avec ID3v2 ──────────────────────────────────────────────────
  if (isId3Header(header)) {
    const tagSize = synchsafeToSize(header.subarray(6, 10));
    const cappedSize = id3HeadReadSize(file.size, tagSize, maxTagBytes);
    const headBytes = await readSlice(file, 0, cappedSize);
    const headMeta = normalizeMetadata(
      wasm.parse_metadata_with_limits(headBytes, maxTextBytes, maxCoverBytes),
    );

    if (headMeta.title && headMeta.artist && headMeta.album) {
      return headMeta;
    }

    const tailBytes = await readTail(file, 128);
    const tailMeta = normalizeMetadata(
      wasm.parse_metadata_with_limits(tailBytes, maxTextBytes, maxCoverBytes),
    );
    return mergeMetadata(headMeta, tailMeta);
  }

  // ── MPEG brut (sans ID3v2) ──────────────────────────────────────────
  if (isMpegSync(header)) {
    const headBytes = await readHeader(file, RAW_MPEG_HEAD_BYTES);
    const headMeta = normalizeMetadata(
      wasm.parse_metadata_with_limits(headBytes, maxTextBytes, maxCoverBytes),
    );

    const tailBytes = await readTail(file, 128);
    const tailMeta = normalizeMetadata(
      wasm.parse_metadata_with_limits(tailBytes, maxTextBytes, maxCoverBytes),
    );
    return mergeMetadata(headMeta, tailMeta);
  }

  // ── Fallback : essayer uniquement la queue ID3v1 ──────────────────────
  const tailBytes = await readTail(file, 128);
  const tailMeta = normalizeMetadata(
    wasm.parse_metadata_with_limits(tailBytes, maxTextBytes, maxCoverBytes),
  );
  return tailMeta;
}

type BatchTask = {
  file: File;
  index: number;
  header: Uint8Array;
  headBytes?: Uint8Array;
  tailBytes?: Uint8Array;
  metadata?: MetadataResult;
};

export async function parseMetadataBatch(
  files: File[],
  options?: MetadataBatchOptions,
): Promise<MetadataResult[]> {
  const wasm = requireWasm();
  const { maxTextBytes, maxCoverBytes, maxTagBytes, maxFlacBytes } =
    normalizeLimits(options);
  const batchSize = Math.max(1, options?.batchSize ?? 8);
  const results: MetadataResult[] = new Array(files.length);

  for (let batchStart = 0; batchStart < files.length; batchStart += batchSize) {
    const batch = files.slice(batchStart, batchStart + batchSize);
    const tasks: BatchTask[] = await Promise.all(
      batch.map(async (file, index) => {
        const header = await readHeader(file, ID3_HEADER_SIZE);
        return {
          file,
          index: batchStart + index,
          header,
        };
      }),
    );

    // ── Passe d'en-tête ─────────────────────────────────────────────
    const headBuffers: Uint8Array[] = [];
    const headTasks: BatchTask[] = [];
    for (const task of tasks) {
      if (isFlacHeader(task.header)) {
        task.headBytes = await readFlacMetadataPrefix(task.file, maxFlacBytes);
      } else if (isId3Header(task.header)) {
        const tagSize = synchsafeToSize(task.header.subarray(6, 10));
        const cappedSize = id3HeadReadSize(
          task.file.size,
          tagSize,
          maxTagBytes,
        );
        task.headBytes = await readSlice(task.file, 0, cappedSize);
      } else if (isMpegSync(task.header)) {
        // MPEG brut sans ID3v2 — lire suffisamment pour trouver l'en-tête de trame
        task.headBytes = await readHeader(task.file, RAW_MPEG_HEAD_BYTES);
      }

      if (task.headBytes) {
        headBuffers.push(task.headBytes);
        headTasks.push(task);
      }
    }

    if (headBuffers.length) {
      const parsed = wasm.parse_metadata_batch(
        headBuffers,
        maxTextBytes,
        maxCoverBytes,
      );
      parsed.forEach((value, idx) => {
        headTasks[idx].metadata = normalizeMetadata(value);
      });
    }

    // ── Passe de queue (repli ID3v1) ────────────────────────────────
    const tailBuffers: Uint8Array[] = [];
    const tailTasks: BatchTask[] = [];
    for (const task of tasks) {
      const meta = task.metadata ?? {};
      const needsTail =
        !meta.title || !meta.artist || !meta.album || !meta.title?.length;
      if (needsTail) {
        task.tailBytes = await readTail(task.file, 128);
        tailBuffers.push(task.tailBytes);
        tailTasks.push(task);
      }
    }

    if (tailBuffers.length) {
      const parsed = wasm.parse_metadata_batch(
        tailBuffers,
        maxTextBytes,
        maxCoverBytes,
      );
      parsed.forEach((value, idx) => {
        const tailMeta = normalizeMetadata(value);
        tailTasks[idx].metadata = mergeMetadata(
          tailTasks[idx].metadata ?? {},
          tailMeta,
        );
      });
    }

    for (const task of tasks) {
      results[task.index] = task.metadata ?? {};
    }
  }

  return results;
}
