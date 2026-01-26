const DB_MIN = -120;
const DB_MAX = 0;
const DB_RANGE = DB_MAX - DB_MIN;

const LUT_SIZE = 8192;
const LUT_SIZE_MINUS_1 = LUT_SIZE - 1;
const LUT_SCALE = LUT_SIZE_MINUS_1 / DB_RANGE;

const DB_TO_LINEAR_FACTOR = 0.1;
const LINEAR_TO_DB_FACTOR = 10;

/**
 * LUT: index dB → puissance linéaire
 * L'index mappe de [DB_MIN, DB_MAX] à [0, LUT_SIZE-1]
 */
const dbToLinearLUT = new Float64Array(LUT_SIZE);

/**
 * LUT: index linéaire → dB
 * L'index mappe logarithmiquement de [MIN_LINEAR, 1.0] à [0, LUT_SIZE-1]
 */
const linearToDbLUT = new Float64Array(LUT_SIZE);

const MIN_LINEAR_POWER = Math.pow(10, DB_MIN * DB_TO_LINEAR_FACTOR);
const MAX_LINEAR_POWER = 1.0; // 0 dB
const LOG_MIN_LINEAR = Math.log(MIN_LINEAR_POWER);
const LOG_MAX_LINEAR = Math.log(MAX_LINEAR_POWER);
const LOG_LINEAR_RANGE = LOG_MAX_LINEAR - LOG_MIN_LINEAR;

function initializeLUTs(): void {
  for (let i = 0; i < LUT_SIZE; i++) {
    const db = DB_MIN + (i / LUT_SIZE_MINUS_1) * DB_RANGE;
    dbToLinearLUT[i] = Math.pow(10, db * DB_TO_LINEAR_FACTOR);
  }

  for (let i = 0; i < LUT_SIZE; i++) {
    const t = i / LUT_SIZE_MINUS_1;
    const logValue = LOG_MIN_LINEAR + t * LOG_LINEAR_RANGE;
    const linearValue = Math.exp(logValue);
    linearToDbLUT[i] = LINEAR_TO_DB_FACTOR * Math.log10(linearValue);
  }
}

initializeLUTs();

export function dbToLinear(db: number): number {
  if (db <= DB_MIN) return MIN_LINEAR_POWER;
  if (db >= DB_MAX) return MAX_LINEAR_POWER;

  const indexF = (db - DB_MIN) * LUT_SCALE;
  const indexLow = indexF | 0;
  const indexHigh = indexLow + 1;
  const frac = indexF - indexLow;

  if (indexHigh >= LUT_SIZE) return dbToLinearLUT[LUT_SIZE_MINUS_1];

  return (
    dbToLinearLUT[indexLow] +
    frac * (dbToLinearLUT[indexHigh] - dbToLinearLUT[indexLow])
  );
}

/**
 * Légèrement moins précise mais plus rapide
 */
export function fastDbToLinear(db: number): number {
  if (db <= DB_MIN) return MIN_LINEAR_POWER;
  if (db >= DB_MAX) return MAX_LINEAR_POWER;

  const index = ((db - DB_MIN) * LUT_SCALE + 0.5) | 0;
  return dbToLinearLUT[index];
}

export function linearToDb(linear: number): number {
  if (linear <= MIN_LINEAR_POWER) return DB_MIN;
  if (linear >= MAX_LINEAR_POWER) return DB_MAX;

  const logValue = Math.log(linear);
  const normalized = (logValue - LOG_MIN_LINEAR) / LOG_LINEAR_RANGE;
  const indexF = normalized * LUT_SIZE_MINUS_1;
  const indexLow = indexF | 0;
  const indexHigh = indexLow + 1;
  const frac = indexF - indexLow;

  if (indexHigh >= LUT_SIZE) return linearToDbLUT[LUT_SIZE_MINUS_1];

  return (
    linearToDbLUT[indexLow] +
    frac * (linearToDbLUT[indexHigh] - linearToDbLUT[indexLow])
  );
}

/**
 * Sans interpolation
 */
export function fastLinearToDb(linear: number): number {
  if (linear <= MIN_LINEAR_POWER) return DB_MIN;
  if (linear >= MAX_LINEAR_POWER) return DB_MAX;

  const logValue = Math.log(linear);
  const index =
    (((logValue - LOG_MIN_LINEAR) / LOG_LINEAR_RANGE) * LUT_SIZE_MINUS_1 +
      0.5) |
    0;
  return linearToDbLUT[index < LUT_SIZE ? index : LUT_SIZE_MINUS_1];
}

export function dbToLinearExact(db: number): number {
  return Math.pow(10, db * DB_TO_LINEAR_FACTOR);
}

export function linearToDbExact(linear: number): number {
  return LINEAR_TO_DB_FACTOR * Math.log10(linear);
}

// ============================================================================
// TYPES
// ============================================================================

export interface RtaBandDef {
  freqStart: number;
  freqEnd: number;
  freqCenter: number;
  binStart: number;
  binEnd: number;
}

export interface PreparedBands {
  bands: RtaBandDef[];
  binStarts: Int32Array;
  binEnds: Int32Array;
  bandCount: number;
}

export interface ProcessingParams {
  minDb: number;
  extraSmoothing: number;
  peakHold: boolean;
  peakDecay: number;
  peakHoldFrames: number;
}

export interface ProcessingState {
  smoothedLinear: Float64Array;
  peaksLinear: Float64Array;
  peakHoldCounters: Uint16Array;
  smoothedDb: Float32Array;
  peaksDb: Float32Array;
  minLinear: number;
}

export function calculateBands(
  numBands: number,
  sampleRate: number,
  fftSize: number,
): RtaBandDef[] {
  const minFreq = 20;
  const maxFreq = Math.min(20000, sampleRate / 2);
  const logMin = Math.log10(minFreq);
  const logMax = Math.log10(maxFreq);
  const logStep = (logMax - logMin) / numBands;
  const binWidth = sampleRate / fftSize;
  const halfFft = fftSize / 2 - 1;

  const result = new Array<RtaBandDef>(numBands);

  for (let i = 0; i < numBands; i++) {
    const freqStart = Math.pow(10, logMin + i * logStep);
    const freqEnd = Math.pow(10, logMin + (i + 1) * logStep);

    result[i] = {
      freqStart,
      freqEnd,
      freqCenter: Math.sqrt(freqStart * freqEnd),
      binStart: Math.max(0, Math.floor(freqStart / binWidth)),
      binEnd: Math.min(halfFft, Math.ceil(freqEnd / binWidth)),
    };
  }

  return result;
}

export function prepareBands(bands: RtaBandDef[]): PreparedBands {
  const bandCount = bands.length;
  const binStarts = new Int32Array(bandCount);
  const binEnds = new Int32Array(bandCount);

  for (let i = 0; i < bandCount; i++) {
    binStarts[i] = bands[i].binStart | 0;
    binEnds[i] = bands[i].binEnd | 0;
  }

  return { bands, binStarts, binEnds, bandCount };
}

export function createProcessingState(
  numBands: number,
  minDb: number,
): ProcessingState {
  const minLinear = Math.pow(10, minDb * DB_TO_LINEAR_FACTOR);

  const smoothedLinear = new Float64Array(numBands);
  const peaksLinear = new Float64Array(numBands);
  const peakHoldCounters = new Uint16Array(numBands);
  const smoothedDb = new Float32Array(numBands);
  const peaksDb = new Float32Array(numBands);

  smoothedLinear.fill(minLinear);
  peaksLinear.fill(minLinear);
  peakHoldCounters.fill(0);
  smoothedDb.fill(minDb);
  peaksDb.fill(minDb);

  return {
    smoothedLinear,
    peaksLinear,
    peakHoldCounters,
    smoothedDb,
    peaksDb,
    minLinear,
  };
}

export interface ProcessingStateF32 {
  smoothedLinear: Float32Array;
  peaksLinear: Float32Array;
  peakHoldCounters: Uint16Array;
  smoothedDb: Float32Array;
  peaksDb: Float32Array;
  minLinear: number;
}

export function createProcessingStateF32(
  numBands: number,
  minDb: number,
): ProcessingStateF32 {
  const minLinear = Math.pow(10, minDb * DB_TO_LINEAR_FACTOR);

  const smoothedLinear = new Float32Array(numBands);
  const peaksLinear = new Float32Array(numBands);
  const peakHoldCounters = new Uint16Array(numBands);
  const smoothedDb = new Float32Array(numBands);
  const peaksDb = new Float32Array(numBands);

  smoothedLinear.fill(minLinear);
  peaksLinear.fill(minLinear);
  peakHoldCounters.fill(0);
  smoothedDb.fill(minDb);
  peaksDb.fill(minDb);

  return {
    smoothedLinear,
    peaksLinear,
    peakHoldCounters,
    smoothedDb,
    peaksDb,
    minLinear,
  };
}

export function process(
  frequencyData: Float32Array,
  prepared: PreparedBands,
  state: ProcessingStateF32,
  params: ProcessingParams,
): void {
  const bandsLen = prepared.bandCount;
  if (bandsLen === 0) return;

  const binStarts = prepared.binStarts;
  const binEnds = prepared.binEnds;
  const smoothedLin = state.smoothedLinear;
  const peaksLin = state.peaksLinear;
  const holdCounters = state.peakHoldCounters;
  const minLinear = state.minLinear;

  const alpha = 1 - params.extraSmoothing;
  const invAlpha = params.extraSmoothing;
  const peakHoldEnabled = params.peakHold;
  const decay = params.peakDecay;
  const holdFrames = params.peakHoldFrames;

  const lutScale = LUT_SCALE;
  const dbMin = DB_MIN;
  const minLin = MIN_LINEAR_POWER;
  const maxLin = MAX_LINEAR_POWER;
  const lut = dbToLinearLUT;

  for (let i = 0; i < bandsLen; i++) {
    const binStart = binStarts[i];
    const binEnd = binEnds[i];
    const count = binEnd - binStart + 1;
    const invCount = 1 / count;

    let sum = 0;
    let bin = binStart;

    const end8 = binStart + ((count >> 3) << 3);
    while (bin < end8) {
      const d0 = frequencyData[bin];
      const d1 = frequencyData[bin + 1];
      const d2 = frequencyData[bin + 2];
      const d3 = frequencyData[bin + 3];
      const d4 = frequencyData[bin + 4];
      const d5 = frequencyData[bin + 5];
      const d6 = frequencyData[bin + 6];
      const d7 = frequencyData[bin + 7];

      sum +=
        (d0 <= dbMin
          ? minLin
          : d0 >= 0
            ? maxLin
            : lut[((d0 - dbMin) * lutScale + 0.5) | 0]) +
        (d1 <= dbMin
          ? minLin
          : d1 >= 0
            ? maxLin
            : lut[((d1 - dbMin) * lutScale + 0.5) | 0]) +
        (d2 <= dbMin
          ? minLin
          : d2 >= 0
            ? maxLin
            : lut[((d2 - dbMin) * lutScale + 0.5) | 0]) +
        (d3 <= dbMin
          ? minLin
          : d3 >= 0
            ? maxLin
            : lut[((d3 - dbMin) * lutScale + 0.5) | 0]) +
        (d4 <= dbMin
          ? minLin
          : d4 >= 0
            ? maxLin
            : lut[((d4 - dbMin) * lutScale + 0.5) | 0]) +
        (d5 <= dbMin
          ? minLin
          : d5 >= 0
            ? maxLin
            : lut[((d5 - dbMin) * lutScale + 0.5) | 0]) +
        (d6 <= dbMin
          ? minLin
          : d6 >= 0
            ? maxLin
            : lut[((d6 - dbMin) * lutScale + 0.5) | 0]) +
        (d7 <= dbMin
          ? minLin
          : d7 >= 0
            ? maxLin
            : lut[((d7 - dbMin) * lutScale + 0.5) | 0]);

      bin += 8;
    }

    // Reste
    while (bin <= binEnd) {
      const d = frequencyData[bin++];
      sum +=
        d <= dbMin
          ? minLin
          : d >= 0
            ? maxLin
            : lut[((d - dbMin) * lutScale + 0.5) | 0];
    }

    // Lissage EMA
    const avg = sum * invCount;
    const smoothed =
      smoothedLin[i] * invAlpha + (avg > minLinear ? avg : minLinear) * alpha;
    smoothedLin[i] = smoothed > minLinear ? smoothed : minLinear;

    if (peakHoldEnabled) {
      const peak = peaksLin[i];
      if (smoothed > peak) {
        peaksLin[i] = smoothed;
        holdCounters[i] = holdFrames;
      } else if (holdCounters[i] > 0) {
        holdCounters[i]--;
      } else {
        const decayed = peak * decay;
        peaksLin[i] = decayed > minLinear ? decayed : minLinear;
      }
    }
  }
}
