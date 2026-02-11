export interface RtaParams {
  fftSize: FftSize;
  smoothingTimeConstant: number;
  extraSmoothing: number;
  peakHold: boolean;
  peakDecay: number;
  minDb: number;
  maxDb: number;
  numBands: number;
}

export const MIN_BANDS = 16;
export const MAX_BANDS = 14844;

export interface SpectrogramParams {
  colorMap: ColorMap;
  frequencyScale: FrequencyScale;
  gamma: number;
  columnInterval: number;
}

export type FftSize = 512 | 1024 | 2048 | 4096 | 8192 | 16384 | 32768;

export type DisplayMode = "bars" | "line" | "spectrogram";

export type ColorMap =
  | "magma"
  | "viridis"
  | "plasma"
  | "inferno"
  | "grayscale"
  | "custom";

export type FrequencyScale = "logarithmic" | "linear";

export interface RtaBand {
  freqStart: number;
  freqEnd: number;
  freqCenter: number;
  binStart: number;
  binEnd: number;
}

export interface RtaRenderConfig {
  width: number;
  height: number;
  displayMode: DisplayMode;
  minDb: number;
  maxDb: number;
  minFreq: number;
  maxFreq: number;
  showPeaks: boolean;
  showGrid: boolean;
  showCursor: boolean;
  cursorPosition: number;
}

export const FREQUENCY_MARKERS = [
  20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000,
];

export const DB_MARKERS = [-90, -80, -70, -60, -50, -40, -30, -20, -10, 0];

export const RTA_COLORS = {
  background: "#1a1a2e",
  gridLine: "rgba(255, 255, 255, 0.1)",
  gridText: "rgba(255, 255, 255, 0.5)",
  barFill: "rgba(0, 200, 150, 0.8)",
  barStroke: "rgba(0, 255, 200, 1)",
  lineFill: "rgba(0, 200, 150, 0.3)",
  lineStroke: "rgba(0, 255, 200, 1)",
  peakLine: "rgba(255, 100, 100, 0.9)",
  cursor: "rgba(255, 255, 0, 0.7)",
};

export function createColorMapLUT(colorMap: ColorMap): Uint32Array {
  const lut = new Uint32Array(256);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r: number, g: number, b: number;

    switch (colorMap) {
      case "magma":
        if (t < 0.13) {
          r = t * 7.69 * 12;
          g = t * 7.69 * 8;
          b = t * 7.69 * 34;
        } else if (t < 0.35) {
          const lt = (t - 0.13) / 0.22;
          r = 12 + lt * 103;
          g = 8 + lt * 52;
          b = 34 + lt * 106;
        } else if (t < 0.6) {
          const lt = (t - 0.35) / 0.25;
          r = 115 + lt * 99;
          g = 60 + lt * 60;
          b = 140 - lt * 40;
        } else if (t < 0.85) {
          const lt = (t - 0.6) / 0.25;
          r = 214 + lt * 31;
          g = 120 + lt * 90;
          b = 100 + lt * 55;
        } else {
          const lt = (t - 0.85) / 0.15;
          r = 245 + lt * 10;
          g = 210 + lt * 45;
          b = 155 + lt * 100;
        }
        break;

      case "viridis":
        if (t < 0.2) {
          const lt = t / 0.2;
          r = 68 - lt * 14;
          g = 1 + lt * 58;
          b = 84 + lt * 48;
        } else if (t < 0.4) {
          const lt = (t - 0.2) / 0.2;
          r = 54 - lt * 21;
          g = 59 + lt * 36;
          b = 132 + lt * 20;
        } else if (t < 0.6) {
          const lt = (t - 0.4) / 0.2;
          r = 33 + lt * 18;
          g = 95 + lt * 50;
          b = 152 - lt * 22;
        } else if (t < 0.8) {
          const lt = (t - 0.6) / 0.2;
          r = 51 + lt * 75;
          g = 145 + lt * 56;
          b = 130 - lt * 60;
        } else {
          const lt = (t - 0.8) / 0.2;
          r = 126 + lt * 127;
          g = 201 + lt * 28;
          b = 70 - lt * 17;
        }
        break;

      case "plasma":
        if (t < 0.25) {
          const lt = t / 0.25;
          r = 13 + lt * 63;
          g = 8 + lt * 10;
          b = 135 + lt * 83;
        } else if (t < 0.5) {
          const lt = (t - 0.25) / 0.25;
          r = 76 + lt * 97;
          g = 18 + lt * 61;
          b = 218 - lt * 35;
        } else if (t < 0.75) {
          const lt = (t - 0.5) / 0.25;
          r = 173 + lt * 55;
          g = 79 + lt * 85;
          b = 183 - lt * 94;
        } else {
          const lt = (t - 0.75) / 0.25;
          r = 228 + lt * 12;
          g = 164 + lt * 85;
          b = 89 - lt * 77;
        }
        break;

      case "inferno":
        if (t < 0.2) {
          const lt = t / 0.2;
          r = lt * 40;
          g = lt * 11;
          b = lt * 84;
        } else if (t < 0.4) {
          const lt = (t - 0.2) / 0.2;
          r = 40 + lt * 61;
          g = 11 + lt * 44;
          b = 84 + lt * 46;
        } else if (t < 0.6) {
          const lt = (t - 0.4) / 0.2;
          r = 101 + lt * 79;
          g = 55 + lt * 52;
          b = 130 - lt * 38;
        } else if (t < 0.8) {
          const lt = (t - 0.6) / 0.2;
          r = 180 + lt * 56;
          g = 107 + lt * 78;
          b = 92 - lt * 49;
        } else {
          const lt = (t - 0.8) / 0.2;
          r = 236 + lt * 16;
          g = 185 + lt * 67;
          b = 43 + lt * 165;
        }
        break;

      case "grayscale":
        r = g = b = t * 255;
        break;

      case "custom":
      default:
        if (t < 0.15) {
          const lt = t / 0.15;
          r = 10 + lt * 15;
          g = 10 + lt * 20;
          b = 30 + lt * 30;
        } else if (t < 0.4) {
          const lt = (t - 0.15) / 0.25;
          r = 25 + lt * 25;
          g = 30 + lt * 70;
          b = 60 + lt * 60;
        } else if (t < 0.65) {
          const lt = (t - 0.4) / 0.25;
          r = 50 + lt * 50;
          g = 100 + lt * 80;
          b = 120 + lt * 30;
        } else if (t < 0.85) {
          const lt = (t - 0.65) / 0.2;
          r = 100 + lt * 100;
          g = 180 + lt * 50;
          b = 150 - lt * 50;
        } else {
          const lt = (t - 0.85) / 0.15;
          r = 200 + lt * 55;
          g = 230 + lt * 25;
          b = 100 + lt * 100;
        }
        break;
    }

    lut[i] = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
  }

  return lut;
}
