import {
  DB_MARKERS,
  FREQUENCY_MARKERS,
  RTA_COLORS,
  type RtaBand,
  type RtaRenderConfig,
} from "../types/rta";

interface RenderCache {
  // Coord X pour les centres des bandes (pour la ligne/crêtes)
  xCenters: Float32Array;
  // Coord X pour le début des bandes (pour les barres)
  xStarts: Float32Array;
  // Largeurs de barres (xEnd - xStart - gap)
  barWidths: Float32Array;
  // Tableau de coordonnées Y
  yCoords: Float32Array;

  barGradient: CanvasGradient | null;
  lineGradient: CanvasGradient | null;

  // Clés d'invalidation du cache
  lastWidth: number;
  lastHeight: number;
  lastMinFreq: number;
  lastMaxFreq: number;
  lastBandsLength: number;

  // Valeurs de l'échelle logarithmique
  logMin: number;
  logMax: number;
  logRange: number;
}

let cache: RenderCache | null = null;

let gridCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let gridConfig: string = "";

/**
 * Appelé uniquement lorsque les dimensions ou la plage de fréquences changent.
 */
function ensureCache(
  width: number,
  height: number,
  bands: RtaBand[],
  minFreq: number,
  maxFreq: number,
): RenderCache {
  const needsRebuild =
    !cache ||
    cache.lastWidth !== width ||
    cache.lastHeight !== height ||
    cache.lastMinFreq !== minFreq ||
    cache.lastMaxFreq !== maxFreq ||
    cache.lastBandsLength !== bands.length;

  if (needsRebuild) {
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const logRange = logMax - logMin;

    const numBands = bands.length;
    const xCenters = new Float32Array(numBands);
    const xStarts = new Float32Array(numBands);
    const barWidths = new Float32Array(numBands);
    const yCoords = new Float32Array(numBands);

    const barGap = 1;

    for (let i = 0; i < numBands; i++) {
      const band = bands[i];

      const logCenter = Math.log10(
        Math.max(minFreq, Math.min(maxFreq, band.freqCenter)),
      );
      xCenters[i] = ((logCenter - logMin) / logRange) * width;

      const logStart = Math.log10(
        Math.max(minFreq, Math.min(maxFreq, band.freqStart)),
      );
      const logEnd = Math.log10(
        Math.max(minFreq, Math.min(maxFreq, band.freqEnd)),
      );

      const x1 = ((logStart - logMin) / logRange) * width;
      const x2 = ((logEnd - logMin) / logRange) * width;

      xStarts[i] = x1;
      barWidths[i] = Math.max(1, x2 - x1 - barGap);
    }

    cache = {
      xCenters,
      xStarts,
      barWidths,
      yCoords,
      barGradient: null, // Sera créé à la première utilisation
      lineGradient: null,
      lastWidth: width,
      lastHeight: height,
      lastMinFreq: minFreq,
      lastMaxFreq: maxFreq,
      lastBandsLength: numBands,
      logMin,
      logMax,
      logRange,
    };
  }

  return cache!;
}

function getBarGradient(
  ctx: CanvasRenderingContext2D,
  height: number,
): CanvasGradient {
  if (!cache!.barGradient) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(0, 255, 200, 0.9)");
    gradient.addColorStop(0.5, "rgba(0, 200, 150, 0.7)");
    gradient.addColorStop(1, "rgba(0, 100, 80, 0.5)");
    cache!.barGradient = gradient;
  }
  return cache!.barGradient;
}

function getLineGradient(
  ctx: CanvasRenderingContext2D,
  height: number,
): CanvasGradient {
  if (!cache!.lineGradient) {
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "rgba(0, 255, 200, 0.4)");
    gradient.addColorStop(1, "rgba(0, 100, 80, 0.1)");
    cache!.lineGradient = gradient;
  }
  return cache!.lineGradient;
}

export function freqToX(
  freq: number,
  width: number,
  minFreq: number = 20,
  maxFreq: number = 20000,
): number {
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const logFreq = Math.log10(Math.max(minFreq, Math.min(maxFreq, freq)));
  return ((logFreq - logMin) / (logMax - logMin)) * width;
}

export function dbToY(
  db: number,
  height: number,
  minDb: number,
  maxDb: number,
): number {
  const normalized = (db - minDb) / (maxDb - minDb);
  return height * (1 - normalized);
}

export function formatFreq(freq: number): string {
  if (freq >= 1000) {
    return `${(freq / 1000).toFixed(freq >= 10000 ? 0 : freq % 1000 === 0 ? 0 : 1)}k`;
  }
  return freq.toString();
}

export function renderGrid(
  width: number,
  height: number,
  minDb: number,
  maxDb: number,
  minFreq: number = 20,
  maxFreq: number = 20000,
): OffscreenCanvas | HTMLCanvasElement {
  const configKey = `${width}-${height}-${minDb}-${maxDb}-${minFreq}-${maxFreq}`;

  if (gridCanvas && gridConfig === configKey) {
    return gridCanvas;
  }

  // Création d'un offscreen canvas si supporté
  if (typeof OffscreenCanvas !== "undefined") {
    gridCanvas = new OffscreenCanvas(width, height);
  } else {
    gridCanvas = document.createElement("canvas");
    gridCanvas.width = width;
    gridCanvas.height = height;
  }
  gridConfig = configKey;

  const ctx = gridCanvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
  if (!ctx) return gridCanvas;

  ctx.clearRect(0, 0, width, height);

  // Regroupement de tous les tracés comme ca on a un seul beginPath/stroke
  ctx.strokeStyle = RTA_COLORS.gridLine;
  ctx.lineWidth = 1;
  ctx.beginPath();

  // Lignes verticales (marqueurs de fréquence)
  for (const freq of FREQUENCY_MARKERS) {
    if (freq >= minFreq && freq <= maxFreq) {
      const x = freqToX(freq, width, minFreq, maxFreq);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
  }

  // Lignes horizontales (marqueurs de dB)
  for (const db of DB_MARKERS) {
    if (db >= minDb && db <= maxDb) {
      const y = dbToY(db, height, minDb, maxDb);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
  }

  ctx.stroke();

  // Texte
  ctx.font = "10px sans-serif";
  ctx.fillStyle = RTA_COLORS.gridText;

  ctx.textAlign = "center";
  for (const freq of FREQUENCY_MARKERS) {
    if (freq >= minFreq && freq <= maxFreq) {
      const x = freqToX(freq, width, minFreq, maxFreq);
      ctx.fillText(formatFreq(freq), x, height - 4);
    }
  }

  ctx.textAlign = "left";
  for (const db of DB_MARKERS) {
    if (db >= minDb && db <= maxDb) {
      const y = dbToY(db, height, minDb, maxDb);
      if (y > 12 && y < height - 20) {
        ctx.fillText(`${db}`, 4, y - 2);
      }
    }
  }

  return gridCanvas;
}

export function renderRta(
  ctx: CanvasRenderingContext2D,
  config: RtaRenderConfig,
  bands: RtaBand[],
  bandData: Float32Array,
  peakData: Float32Array | null,
): void {
  const {
    width,
    height,
    displayMode,
    minDb,
    maxDb,
    minFreq,
    maxFreq,
    showPeaks,
    showGrid,
    showCursor,
    cursorPosition,
  } = config;

  // Effacement du canvas avec l'arrière-plan
  ctx.fillStyle = RTA_COLORS.background;
  ctx.fillRect(0, 0, width, height);

  if (showGrid) {
    const grid = renderGrid(width, height, minDb, maxDb, minFreq, maxFreq);
    ctx.drawImage(grid, 0, 0);
  }

  if (bands.length === 0 || bandData.length === 0) {
    return;
  }

  ensureCache(width, height, bands, minFreq, maxFreq);

  // On calcule db vers Y ici pour ne pas le faire dans la boucle
  const dbRange = maxDb - minDb;
  const dbRangeInv = 1 / dbRange;

  if (displayMode === "bars") {
    renderBars(ctx, height, bands, bandData, minDb, dbRangeInv);
  } else {
    renderLine(ctx, height, bands, bandData, minDb, dbRangeInv);
  }

  if (showPeaks && peakData) {
    renderPeaks(ctx, height, bands, peakData, minDb, dbRangeInv);
  }

  if (showCursor && cursorPosition >= 0 && cursorPosition <= 1) {
    const cursorX = cursorPosition * width;
    ctx.strokeStyle = RTA_COLORS.cursor;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, height);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function renderBars(
  ctx: CanvasRenderingContext2D,
  height: number,
  bands: RtaBand[],
  bandData: Float32Array,
  minDb: number,
  dbRangeInv: number,
): void {
  const c = cache!;
  const xs = c.xStarts;
  const bw = c.barWidths;
  const yc = c.yCoords;
  const bd = bandData;
  const n = bands.length < bd.length ? bands.length : bd.length;
  if (n === 0) return;

  const h = height;
  const hInv = h * dbRangeInv;
  const hOff = h * minDb * dbRangeInv;

  ctx.beginPath();
  let i = 0;
  const n8 = n - 7;
  let y: number;
  for (; i < n8; i += 8) {
    y = yc[i] = h - hInv * bd[i] + hOff;
    if (y < h) ctx.rect(xs[i], y, bw[i], h - y);
    y = yc[i + 1] = h - hInv * bd[i + 1] + hOff;
    if (y < h) ctx.rect(xs[i + 1], y, bw[i + 1], h - y);
    y = yc[i + 2] = h - hInv * bd[i + 2] + hOff;
    if (y < h) ctx.rect(xs[i + 2], y, bw[i + 2], h - y);
    y = yc[i + 3] = h - hInv * bd[i + 3] + hOff;
    if (y < h) ctx.rect(xs[i + 3], y, bw[i + 3], h - y);
    y = yc[i + 4] = h - hInv * bd[i + 4] + hOff;
    if (y < h) ctx.rect(xs[i + 4], y, bw[i + 4], h - y);
    y = yc[i + 5] = h - hInv * bd[i + 5] + hOff;
    if (y < h) ctx.rect(xs[i + 5], y, bw[i + 5], h - y);
    y = yc[i + 6] = h - hInv * bd[i + 6] + hOff;
    if (y < h) ctx.rect(xs[i + 6], y, bw[i + 6], h - y);
    y = yc[i + 7] = h - hInv * bd[i + 7] + hOff;
    if (y < h) ctx.rect(xs[i + 7], y, bw[i + 7], h - y);
  }
  for (; i < n; i++) {
    y = yc[i] = h - hInv * bd[i] + hOff;
    if (y < h) ctx.rect(xs[i], y, bw[i], h - y);
  }
  ctx.fillStyle = getBarGradient(ctx, h);
  ctx.fill();

  ctx.beginPath();
  for (i = 0; i < n8; i += 8) {
    if (yc[i] < h) ctx.rect(xs[i], yc[i], bw[i], 2);
    if (yc[i + 1] < h) ctx.rect(xs[i + 1], yc[i + 1], bw[i + 1], 2);
    if (yc[i + 2] < h) ctx.rect(xs[i + 2], yc[i + 2], bw[i + 2], 2);
    if (yc[i + 3] < h) ctx.rect(xs[i + 3], yc[i + 3], bw[i + 3], 2);
    if (yc[i + 4] < h) ctx.rect(xs[i + 4], yc[i + 4], bw[i + 4], 2);
    if (yc[i + 5] < h) ctx.rect(xs[i + 5], yc[i + 5], bw[i + 5], 2);
    if (yc[i + 6] < h) ctx.rect(xs[i + 6], yc[i + 6], bw[i + 6], 2);
    if (yc[i + 7] < h) ctx.rect(xs[i + 7], yc[i + 7], bw[i + 7], 2);
  }
  for (; i < n; i++) {
    if (yc[i] < h) ctx.rect(xs[i], yc[i], bw[i], 2);
  }
  ctx.fillStyle = RTA_COLORS.barStroke;
  ctx.fill();
}

function renderLine(
  ctx: CanvasRenderingContext2D,
  height: number,
  bands: RtaBand[],
  bandData: Float32Array,
  minDb: number,
  dbRangeInv: number,
): void {
  const bd = bandData;
  const n = bands.length < bd.length ? bands.length : bd.length;
  if (n < 2) return;

  const c = cache!;
  const xc = c.xCenters;
  const yc = c.yCoords;
  const h = height;
  const hInv = h * dbRangeInv;
  const offset = h * minDb * dbRangeInv;

  let i = 0;
  const n8 = n - 7;
  for (; i < n8; i += 8) {
    yc[i] = h - hInv * bd[i] + offset;
    yc[i + 1] = h - hInv * bd[i + 1] + offset;
    yc[i + 2] = h - hInv * bd[i + 2] + offset;
    yc[i + 3] = h - hInv * bd[i + 3] + offset;
    yc[i + 4] = h - hInv * bd[i + 4] + offset;
    yc[i + 5] = h - hInv * bd[i + 5] + offset;
    yc[i + 6] = h - hInv * bd[i + 6] + offset;
    yc[i + 7] = h - hInv * bd[i + 7] + offset;
  }
  for (; i < n; i++) yc[i] = h - hInv * bd[i] + offset;

  const lastIdx = n - 1;
  const x0 = xc[0];
  const y0 = yc[0];
  const xL = xc[lastIdx];
  const yL = yc[lastIdx];

  ctx.beginPath();
  ctx.moveTo(x0, h);
  ctx.lineTo(x0, y0);

  let px = x0,
    py = y0,
    x: number,
    y: number,
    mx: number,
    my: number;
  for (i = 1; i < n; i++) {
    x = xc[i];
    y = yc[i];
    mx = (px + x) * 0.5;
    my = (py + y) * 0.5;
    ctx.quadraticCurveTo(px, py, mx, my);
    px = x;
    py = y;
  }
  ctx.lineTo(xL, yL);
  ctx.lineTo(xL, h);
  ctx.closePath();
  ctx.fillStyle = getLineGradient(ctx, h);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x0, y0);
  px = x0;
  py = y0;
  for (i = 1; i < n; i++) {
    x = xc[i];
    y = yc[i];
    mx = (px + x) * 0.5;
    my = (py + y) * 0.5;
    ctx.quadraticCurveTo(px, py, mx, my);
    px = x;
    py = y;
  }
  ctx.lineTo(xL, yL);
  ctx.strokeStyle = RTA_COLORS.lineStroke;
  ctx.lineWidth = 2;
  ctx.stroke();
}

function renderPeaks(
  ctx: CanvasRenderingContext2D,
  height: number,
  bands: RtaBand[],
  peakData: Float32Array,
  minDb: number,
  dbRangeInv: number,
): void {
  const numBands = Math.min(bands.length, peakData.length);
  if (numBands === 0) {
    return;
  }

  const xCenters = cache!.xCenters;

  ctx.beginPath();
  ctx.strokeStyle = RTA_COLORS.peakLine;
  ctx.lineWidth = 1.5;

  const firstDb = peakData[0];
  const firstNormalized = (firstDb - minDb) * dbRangeInv;
  const firstY = height * (1 - firstNormalized);
  ctx.moveTo(xCenters[0], firstY);

  for (let i = 1; i < numBands; i++) {
    const db = peakData[i];
    const normalized = (db - minDb) * dbRangeInv;
    const y = height * (1 - normalized);
    ctx.lineTo(xCenters[i], y);
  }

  ctx.stroke();
}

export function clearGridCache(): void {
  gridCanvas = null;
  gridConfig = "";
}

export function clearAllCaches(): void {
  cache = null;
  gridCanvas = null;
  gridConfig = "";
}
