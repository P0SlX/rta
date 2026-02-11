import {
  createColorMapLUT,
  RTA_COLORS,
  type ColorMap,
  type FrequencyScale,
} from "../types/rta";

const SPECTROGRAM_WIDTH = 2048;

let colorLut: Uint32Array | null = null;
let currentColorMap: ColorMap = "custom";

let spectrogramData: Uint32Array | null = null;
let bufferCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let bufferCtx:
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D
  | null = null;
let bufferImageData: ImageData | null = null;
let bufferHeight = 0;
let writeColumn = 0;

function ensureColorLut(colorMap: ColorMap): Uint32Array {
  if (!colorLut || currentColorMap !== colorMap) {
    colorLut = createColorMapLUT(colorMap);
    currentColorMap = colorMap;
  }
  return colorLut;
}

function ensureBufferCanvas(height: number): void {
  if (spectrogramData && bufferHeight === height) {
    return;
  }

  const oldData = spectrogramData;
  const oldHeight = bufferHeight;
  const oldWriteColumn = writeColumn;

  if (typeof OffscreenCanvas !== "undefined") {
    bufferCanvas = new OffscreenCanvas(SPECTROGRAM_WIDTH, height);
  } else {
    bufferCanvas = document.createElement("canvas");
    bufferCanvas.width = SPECTROGRAM_WIDTH;
    bufferCanvas.height = height;
  }

  bufferCtx = bufferCanvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  if (bufferCtx) {
    bufferCtx.fillStyle = RTA_COLORS.background;
    bufferCtx.fillRect(0, 0, SPECTROGRAM_WIDTH, height);
    bufferImageData = bufferCtx.getImageData(0, 0, SPECTROGRAM_WIDTH, height);
    spectrogramData = new Uint32Array(bufferImageData.data.buffer);

    if (oldData && oldHeight > 0) {
      const minHeight = Math.min(oldHeight, height);
      for (let col = 0; col < SPECTROGRAM_WIDTH; col++) {
        for (let y = 0; y < minHeight; y++) {
          const oldY = Math.floor((y / height) * oldHeight);
          spectrogramData[y * SPECTROGRAM_WIDTH + col] =
            oldData[oldY * SPECTROGRAM_WIDTH + col];
        }
      }
      writeColumn = oldWriteColumn;
    } else {
      writeColumn = 0;
    }
  }

  bufferHeight = height;
}

export function renderSpectrogramColumn(
  bandData: Float32Array,
  numBands: number,
  minDb: number,
  maxDb: number,
  height: number,
  colorMap: ColorMap,
  gamma: number,
  frequencyScale: FrequencyScale,
): void {
  ensureBufferCanvas(height);
  if (!spectrogramData) return;

  const lut = ensureColorLut(colorMap);
  const dbRange = maxDb - minDb;
  const dbRangeInv = 1 / dbRange;
  const col = writeColumn;

  const minFreq = 20;
  const maxFreq = 20000;
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);

  for (let y = 0; y < height; y++) {
    let bandIndex: number;
    const normalizedY = (height - 1 - y) / (height - 1);

    if (frequencyScale === "logarithmic") {
      const logFreq = logMin + normalizedY * (logMax - logMin);
      const bandNormalized = (logFreq - logMin) / (logMax - logMin);
      bandIndex = Math.floor(bandNormalized * (numBands - 1));
    } else {
      const freq = minFreq + normalizedY * (maxFreq - minFreq);
      const logFreq = Math.log10(freq);
      const bandNormalized = (logFreq - logMin) / (logMax - logMin);
      bandIndex = Math.floor(bandNormalized * (numBands - 1));
    }

    bandIndex = Math.max(0, Math.min(numBands - 1, bandIndex));
    const db = bandData[bandIndex];

    let normalized = (db - minDb) * dbRangeInv;
    if (normalized < 0) normalized = 0;
    else if (normalized > 1) normalized = 1;

    if (gamma !== 1) {
      normalized = Math.pow(normalized, gamma);
    }

    const lutIndex = (normalized * 255) | 0;
    spectrogramData[y * SPECTROGRAM_WIDTH + col] = lut[lutIndex];
  }

  writeColumn = (writeColumn + 1) % SPECTROGRAM_WIDTH;
}

export function renderSpectrogram(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  minDb: number,
  showGrid: boolean,
  frequencyScale: FrequencyScale,
  minFreq: number,
  maxFreq: number,
): void {
  ensureBufferCanvas(height);
  if (!bufferImageData || !bufferCtx || !spectrogramData) {
    ctx.fillStyle = RTA_COLORS.background;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  bufferCtx.putImageData(bufferImageData, 0, 0);

  const col = writeColumn;
  const visibleCols = Math.min(width, SPECTROGRAM_WIDTH);

  if (col >= visibleCols) {
    ctx.drawImage(
      bufferCanvas!,
      col - visibleCols,
      0,
      visibleCols,
      height,
      0,
      0,
      visibleCols,
      height,
    );
  } else {
    const oldestCol =
      (col + SPECTROGRAM_WIDTH - visibleCols) % SPECTROGRAM_WIDTH;
    const rightWidth = SPECTROGRAM_WIDTH - oldestCol;

    if (rightWidth >= visibleCols) {
      ctx.drawImage(
        bufferCanvas!,
        oldestCol,
        0,
        visibleCols,
        height,
        0,
        0,
        visibleCols,
        height,
      );
    } else {
      ctx.drawImage(
        bufferCanvas!,
        oldestCol,
        0,
        rightWidth,
        height,
        0,
        0,
        rightWidth,
        height,
      );
      const leftWidth = visibleCols - rightWidth;
      ctx.drawImage(
        bufferCanvas!,
        0,
        0,
        leftWidth,
        height,
        rightWidth,
        0,
        leftWidth,
        height,
      );
    }
  }

  if (showGrid) {
    renderSpectrogramGrid(
      ctx,
      width,
      height,
      minDb,
      frequencyScale,
      minFreq,
      maxFreq,
    );
  }
}

const FREQ_MARKERS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];

function renderSpectrogramGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  minDb: number,
  frequencyScale: FrequencyScale,
  minFreq: number,
  maxFreq: number,
): void {
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const logRange = logMax - logMin;
  const linRange = maxFreq - minFreq;

  for (let i = 0; i < FREQ_MARKERS.length; i++) {
    const freq = FREQ_MARKERS[i];
    if (freq >= minFreq && freq <= maxFreq) {
      let normalized: number;
      if (frequencyScale === "logarithmic") {
        normalized = (Math.log10(freq) - logMin) / logRange;
      } else {
        normalized = (freq - minFreq) / linRange;
      }
      const y = height - normalized * height;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
  }

  ctx.stroke();

  ctx.font = "10px sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";

  ctx.textAlign = "left";
  for (let i = 0; i < FREQ_MARKERS.length; i++) {
    const freq = FREQ_MARKERS[i];
    if (freq >= minFreq && freq <= maxFreq) {
      let normalized: number;
      if (frequencyScale === "logarithmic") {
        normalized = (Math.log10(freq) - logMin) / logRange;
      } else {
        normalized = (freq - minFreq) / linRange;
      }
      const y = height - normalized * height;
      if (y > 12 && y < height - 10) {
        const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
        ctx.fillText(label, 4, y - 2);
      }
    }
  }
  ctx.textAlign = "right";
  ctx.fillText(`${minDb}dB`, width - 4, height - 4);
}

export function clearSpectrogramBuffer(): void {
  if (spectrogramData && bufferImageData && bufferCtx) {
    const bgColor =
      (255 << 24) |
      (parseInt(RTA_COLORS.background.slice(5, 7), 16) << 16) |
      (parseInt(RTA_COLORS.background.slice(3, 5), 16) << 8) |
      parseInt(RTA_COLORS.background.slice(1, 3), 16);

    spectrogramData.fill(bgColor);
    writeColumn = 0;
  }
}

export function resetSpectrogramState(): void {
  spectrogramData = null;
  bufferCanvas = null;
  bufferCtx = null;
  bufferImageData = null;
  bufferHeight = 0;
  writeColumn = 0;
}
