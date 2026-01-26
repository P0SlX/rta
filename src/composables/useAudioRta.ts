import { onUnmounted, shallowRef } from "vue";
import type { FftSize, RtaBand, RtaParams } from "../types/rta";
import { MAX_BANDS, MIN_BANDS } from "../types/rta";

const DB_MIN = -120;
const DB_MAX = 0;
const DB_RANGE = DB_MAX - DB_MIN;
const LUT_SIZE = 8192;
const LUT_SIZE_MINUS_1 = LUT_SIZE - 1;
const LUT_SCALE = LUT_SIZE_MINUS_1 / DB_RANGE;

const DB_TO_LINEAR_FACTOR = 0.1;
const LINEAR_TO_DB_FACTOR = 10;

const MIN_LINEAR_POWER = Math.pow(10, DB_MIN * DB_TO_LINEAR_FACTOR);
const MAX_LINEAR_POWER = 1.0;
const LOG_MIN_LINEAR = Math.log(MIN_LINEAR_POWER);
const LOG_MAX_LINEAR = Math.log(MAX_LINEAR_POWER);
const LOG_LINEAR_RANGE = LOG_MAX_LINEAR - LOG_MIN_LINEAR;

const PEAK_HOLD_FRAMES = 30; // ~0.5s à 60fps

// LUT
const dbToLinearLUT = new Float64Array(LUT_SIZE);
const linearToDbLUT = new Float64Array(LUT_SIZE);

(function initializeLUTs(): void {
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
})();

const DEFAULT_PARAMS: Readonly<RtaParams> = Object.freeze({
  fftSize: 8192,
  smoothingTimeConstant: 0.8,
  extraSmoothing: 0.3,
  peakHold: true,
  peakDecay: 0.98,
  minDb: -100,
  maxDb: 0,
  numBands: 128,
});

interface FrequencyDataResult {
  bands: Float32Array;
  peaks: Float32Array;
}

export function useAudioRta() {
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let sourceNode: MediaElementAudioSourceNode | null = null;
  let gainNode: GainNode | null = null;
  let audioElement: HTMLAudioElement | null = null;

  const isPlaying = shallowRef(false);
  const isLoaded = shallowRef(false);
  const currentTime = shallowRef(0);
  const duration = shallowRef(0);
  const fileName = shallowRef("");
  const error = shallowRef<string | null>(null);
  const sampleRate = shallowRef(44100);
  const volume = shallowRef(0.5);
  const endedSignal = shallowRef(0);

  const fftSize = shallowRef<FftSize>(DEFAULT_PARAMS.fftSize);
  const smoothingTimeConstant = shallowRef(
    DEFAULT_PARAMS.smoothingTimeConstant,
  );
  const extraSmoothing = shallowRef(DEFAULT_PARAMS.extraSmoothing);
  const peakHold = shallowRef(DEFAULT_PARAMS.peakHold);
  const peakDecay = shallowRef(DEFAULT_PARAMS.peakDecay);
  const numBands = shallowRef(DEFAULT_PARAMS.numBands);
  const minDb = shallowRef(DEFAULT_PARAMS.minDb);
  const maxDb = shallowRef(DEFAULT_PARAMS.maxDb);

  const params: RtaParams = {
    fftSize: fftSize.value,
    smoothingTimeConstant: smoothingTimeConstant.value,
    extraSmoothing: extraSmoothing.value,
    peakHold: peakHold.value,
    peakDecay: peakDecay.value,
    minDb: minDb.value,
    maxDb: maxDb.value,
    numBands: numBands.value,
  };

  let frequencyData: Float32Array | null = null;

  let bands: RtaBand[] = [];
  let binStarts: Int32Array | null = null;
  let binEnds: Int32Array | null = null;

  let smoothedLinear: Float32Array | null = null;
  let peaksLinear: Float32Array | null = null;
  let peakHoldCounters: Uint16Array | null = null;

  let smoothedDb: Float32Array | null = null;
  let peaksDb: Float32Array | null = null;

  let cachedMinLinear = Math.pow(
    10,
    DEFAULT_PARAMS.minDb * DB_TO_LINEAR_FACTOR,
  );

  // Coefs EMA
  let cachedAlpha = 1 - DEFAULT_PARAMS.extraSmoothing;
  let cachedInvAlpha = DEFAULT_PARAMS.extraSmoothing;
  let cachedPeakDecay = DEFAULT_PARAMS.peakDecay;
  let cachedPeakHold = DEFAULT_PARAMS.peakHold;
  let cachedBandsLength = 0;

  const resultObject: FrequencyDataResult = {
    bands: new Float32Array(0),
    peaks: new Float32Array(0),
  };

  function calculateBands(
    numBands: number,
    sr: number,
    fftSize: number,
  ): RtaBand[] {
    const minFreq = 20;
    const maxFreq = Math.min(20000, sr / 2);
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const logStep = (logMax - logMin) / numBands;
    const binWidth = sr / fftSize;
    const halfFft = fftSize / 2 - 1;

    const result = new Array<RtaBand>(numBands);

    for (let i = 0; i < numBands; i++) {
      const freqStart = Math.pow(10, logMin + i * logStep);
      const freqEnd = Math.pow(10, logMin + (i + 1) * logStep);

      result[i] = {
        freqStart: freqStart,
        freqEnd: freqEnd,
        freqCenter: Math.sqrt(freqStart * freqEnd),
        binStart: Math.max(0, Math.floor(freqStart / binWidth)),
        binEnd: Math.min(halfFft, Math.ceil(freqEnd / binWidth)),
      };
    }

    return result;
  }

  function initializeArrays(): void {
    const size = params.fftSize / 2;
    const numBandsVal = params.numBands;

    frequencyData = new Float32Array(size);

    bands = calculateBands(numBandsVal, sampleRate.value, params.fftSize);
    cachedBandsLength = bands.length;

    binStarts = new Int32Array(cachedBandsLength);
    binEnds = new Int32Array(cachedBandsLength);
    for (let i = 0; i < cachedBandsLength; i++) {
      binStarts[i] = bands[i].binStart | 0;
      binEnds[i] = bands[i].binEnd | 0;
    }

    smoothedLinear = new Float32Array(numBandsVal);
    peaksLinear = new Float32Array(numBandsVal);
    peakHoldCounters = new Uint16Array(numBandsVal);
    smoothedDb = new Float32Array(numBandsVal);
    peaksDb = new Float32Array(numBandsVal);

    cachedMinLinear = Math.pow(10, params.minDb * DB_TO_LINEAR_FACTOR);
    smoothedLinear.fill(cachedMinLinear);
    peaksLinear.fill(cachedMinLinear);
    peakHoldCounters.fill(0);
    smoothedDb.fill(params.minDb);
    peaksDb.fill(params.minDb);

    cachedAlpha = 1 - params.extraSmoothing;
    cachedInvAlpha = params.extraSmoothing;
    cachedPeakDecay = params.peakDecay;
    cachedPeakHold = params.peakHold;

    resultObject.bands = smoothedDb;
    resultObject.peaks = peaksDb;
  }

  async function initAudioContext(): Promise<void> {
    if (audioContext) return;

    try {
      audioContext = new AudioContext();
      sampleRate.value = audioContext.sampleRate;

      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = params.fftSize;
      analyserNode.smoothingTimeConstant = params.smoothingTimeConstant;

      gainNode = audioContext.createGain();
      gainNode.gain.value = volume.value;

      analyserNode.connect(gainNode);
      gainNode.connect(audioContext.destination);

      initializeArrays();
    } catch (e) {
      error.value = `Échec de l'initialisation de l'AudioContext : ${e}`;
      throw e;
    }
  }

  async function resumeContext(): Promise<void> {
    if (audioContext && audioContext.state === "suspended") {
      await audioContext.resume();
    }
  }

  async function loadFile(file: File): Promise<void> {
    error.value = null;

    try {
      await initAudioContext();

      if (!audioElement) {
        audioElement = new Audio();
        audioElement.crossOrigin = "anonymous";

        audioElement.addEventListener("loadedmetadata", handleLoadedMetadata);
        audioElement.addEventListener("timeupdate", handleTimeUpdate);
        audioElement.addEventListener("play", handlePlayEvent);
        audioElement.addEventListener("pause", handlePauseEvent);
        audioElement.addEventListener("ended", handleEnded);
        audioElement.addEventListener("error", handleError);

        if (audioContext && analyserNode && gainNode) {
          sourceNode = audioContext.createMediaElementSource(audioElement);
          sourceNode.connect(analyserNode);
        }
      }

      const url = URL.createObjectURL(file);
      audioElement.src = url;
      fileName.value = file.name;
      isLoaded.value = false;

      await new Promise<void>((resolve, reject) => {
        const onLoad = () => {
          audioElement!.removeEventListener("canplaythrough", onLoad);
          audioElement!.removeEventListener("error", onError);
          resolve();
        };
        const onError = () => {
          audioElement!.removeEventListener("canplaythrough", onLoad);
          audioElement!.removeEventListener("error", onError);
          reject(new Error("Échec du chargement du fichier audio"));
        };
        audioElement!.addEventListener("canplaythrough", onLoad);
        audioElement!.addEventListener("error", onError);
        audioElement!.load();
      });
    } catch (e) {
      error.value = `Échec du chargement du fichier : ${e}`;
      isLoaded.value = false;
      throw e;
    }
  }

  function handleLoadedMetadata(): void {
    if (audioElement) {
      duration.value = audioElement.duration;
      isLoaded.value = true;
    }
  }

  function handleTimeUpdate(): void {
    if (audioElement) {
      currentTime.value = audioElement.currentTime;
    }
  }

  function handlePlayEvent(): void {
    isPlaying.value = true;
  }

  function handlePauseEvent(): void {
    isPlaying.value = false;
  }

  function handleEnded(): void {
    isPlaying.value = false;
    currentTime.value = 0;
    endedSignal.value += 1;
    if (audioElement) {
      audioElement.currentTime = 0;
    }
  }

  function handleError(e: Event): void {
    error.value = `Erreur audio : ${audioElement?.error?.message || "Erreur inconnue"}`;
    console.error("Erreur audio :", e);
  }

  async function play(): Promise<void> {
    if (!audioElement || !isLoaded.value) return;
    try {
      await resumeContext();
      await audioElement.play();
      isPlaying.value = true;
    } catch (e) {
      error.value = `Échec de la lecture : ${e}`;
    }
  }

  function pause(): void {
    if (!audioElement) return;
    audioElement.pause();
    isPlaying.value = false;
  }

  function stop(): void {
    if (!audioElement) return;
    audioElement.pause();
    audioElement.currentTime = 0;
    currentTime.value = 0;
    isPlaying.value = false;
  }

  function seek(time: number): void {
    if (!audioElement || !isLoaded.value) return;
    const clampedTime =
      time < 0 ? 0 : time > duration.value ? duration.value : time;
    audioElement.currentTime = clampedTime;
    currentTime.value = clampedTime;
  }

  function seekToPercent(percent: number): void {
    if (!duration.value) return;
    seek(percent * duration.value);
  }

  function updateFftSize(size: FftSize): void {
    fftSize.value = size;
    params.fftSize = size;
    if (analyserNode) {
      analyserNode.fftSize = size;
      initializeArrays();
    }
  }

  function updateSmoothingTimeConstant(value: number): void {
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    smoothingTimeConstant.value = clamped;
    params.smoothingTimeConstant = clamped;
    if (analyserNode) {
      analyserNode.smoothingTimeConstant = clamped;
    }
  }

  function updateExtraSmoothing(value: number): void {
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    extraSmoothing.value = clamped;
    params.extraSmoothing = clamped;
    cachedAlpha = 1 - clamped;
    cachedInvAlpha = clamped;
  }

  function updatePeakHold(enabled: boolean): void {
    peakHold.value = enabled;
    params.peakHold = enabled;
    cachedPeakHold = enabled;
    if (!enabled && peaksLinear && peaksDb) {
      peaksLinear.fill(cachedMinLinear);
      peaksDb.fill(params.minDb);
    }
  }

  function updatePeakDecay(value: number): void {
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    peakDecay.value = clamped;
    params.peakDecay = clamped;
    cachedPeakDecay = clamped;
  }

  function updateNumBands(num: number): void {
    const clamped =
      num < MIN_BANDS ? MIN_BANDS : num > MAX_BANDS ? MAX_BANDS : num;
    numBands.value = clamped;
    params.numBands = clamped;
    initializeArrays();
  }

  function setVolume(value: number): void {
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    volume.value = clamped;
    if (gainNode) {
      gainNode.gain.value = clamped;
    }
  }

  function getVolume(): number {
    return volume.value;
  }

  function getFrequencyData(): FrequencyDataResult | null {
    if (
      !analyserNode ||
      !frequencyData ||
      !smoothedLinear ||
      !peaksLinear ||
      !peakHoldCounters ||
      !smoothedDb ||
      !peaksDb ||
      !binStarts ||
      !binEnds
    ) {
      return null;
    }

    const bandsLen = cachedBandsLength;
    if (bandsLen === 0) {
      return null;
    }

    analyserNode.getFloatFrequencyData(
      frequencyData as Float32Array<ArrayBuffer>,
    );

    const freqData = frequencyData;
    const smoothedLin = smoothedLinear;
    const peaksLin = peaksLinear;
    const holdCounters = peakHoldCounters;
    const smoothedOutput = smoothedDb;
    const peaksOutput = peaksDb;
    const starts = binStarts;
    const ends = binEnds;

    const alpha = cachedAlpha;
    const invAlpha = cachedInvAlpha;
    const peakHoldEnabled = cachedPeakHold;
    const decay = cachedPeakDecay;
    const minLinear = cachedMinLinear;
    const holdFrames = PEAK_HOLD_FRAMES;

    const lutScale = LUT_SCALE;
    const dbMin = DB_MIN;
    const minLin = MIN_LINEAR_POWER;
    const maxLin = MAX_LINEAR_POWER;
    const lut = dbToLinearLUT;
    const linLut = linearToDbLUT;
    const logMinLin = LOG_MIN_LINEAR;
    const logLinRange = LOG_LINEAR_RANGE;
    const lutSizeM1 = LUT_SIZE_MINUS_1;

    for (let i = 0; i < bandsLen; i++) {
      const binStart = starts[i];
      const binEnd = ends[i];
      const count = binEnd - binStart + 1;

      let sumLinear = 0;
      let bin = binStart;

      const end8 = binStart + ((count >> 3) << 3);
      while (bin < end8) {
        const d0 = freqData[bin];
        const d1 = freqData[bin + 1];
        const d2 = freqData[bin + 2];
        const d3 = freqData[bin + 3];
        const d4 = freqData[bin + 4];
        const d5 = freqData[bin + 5];
        const d6 = freqData[bin + 6];
        const d7 = freqData[bin + 7];

        sumLinear +=
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

      while (bin <= binEnd) {
        const d = freqData[bin++];
        sumLinear +=
          d <= dbMin
            ? minLin
            : d >= 0
              ? maxLin
              : lut[((d - dbMin) * lutScale + 0.5) | 0];
      }

      const avg = sumLinear / count;
      const avgClamped = avg > minLinear ? avg : minLinear;

      const smoothed = smoothedLin[i] * invAlpha + avgClamped * alpha;
      const smoothedClamped = smoothed > minLinear ? smoothed : minLinear;
      smoothedLin[i] = smoothedClamped;

      if (smoothedClamped <= minLin) {
        smoothedOutput[i] = dbMin;
      } else if (smoothedClamped >= maxLin) {
        smoothedOutput[i] = 0;
      } else {
        const logVal = Math.log(smoothedClamped);
        const idx =
          (((logVal - logMinLin) / logLinRange) * lutSizeM1 + 0.5) | 0;
        smoothedOutput[i] = linLut[idx < LUT_SIZE ? idx : lutSizeM1];
      }

      if (peakHoldEnabled) {
        const currentPeakLin = peaksLin[i];

        if (smoothedClamped > currentPeakLin) {
          // Nouveau pic
          peaksLin[i] = smoothedClamped;
          holdCounters[i] = holdFrames;
        } else if (holdCounters[i] > 0) {
          // Phase de maintient de pic
          holdCounters[i]--;
        } else {
          // C'est la décadenceuuux
          const decayed = currentPeakLin * decay;
          peaksLin[i] = decayed > minLinear ? decayed : minLinear;
        }

        const peakLin = peaksLin[i];
        if (peakLin <= minLin) {
          peaksOutput[i] = dbMin;
        } else if (peakLin >= maxLin) {
          peaksOutput[i] = 0;
        } else {
          const logVal = Math.log(peakLin);
          const idx =
            (((logVal - logMinLin) / logLinRange) * lutSizeM1 + 0.5) | 0;
          peaksOutput[i] = linLut[idx < LUT_SIZE ? idx : lutSizeM1];
        }
      }
    }

    return resultObject;
  }

  function getBands(): RtaBand[] {
    return bands;
  }

  function cleanup(): void {
    if (audioElement) {
      audioElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audioElement.removeEventListener("timeupdate", handleTimeUpdate);
      audioElement.removeEventListener("play", handlePlayEvent);
      audioElement.removeEventListener("pause", handlePauseEvent);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.removeEventListener("error", handleError);
      audioElement.pause();
      audioElement.src = "";
    }
    if (sourceNode) {
      sourceNode.disconnect();
    }
    if (analyserNode) {
      analyserNode.disconnect();
    }
    if (gainNode) {
      gainNode.disconnect();
    }
    if (audioContext) {
      audioContext.close();
    }
    gainNode = null;
    audioElement = null;
    sourceNode = null;
    analyserNode = null;
    audioContext = null;
    isLoaded.value = false;
    isPlaying.value = false;
  }

  onUnmounted(cleanup);

  return {
    isPlaying,
    isLoaded,
    currentTime,
    duration,
    fileName,
    error,
    sampleRate,
    volume,
    endedSignal,

    fftSize,
    smoothingTimeConstant,
    extraSmoothing,
    peakHold,
    peakDecay,
    numBands,
    minDb,
    maxDb,

    loadFile,
    play,
    pause,
    stop,
    seek,
    seekToPercent,
    updateFftSize,
    updateSmoothingTimeConstant,
    updateExtraSmoothing,
    updatePeakHold,
    updatePeakDecay,
    updateNumBands,
    setVolume,
    getVolume,
    getFrequencyData,
    getBands,
    resumeContext,
    cleanup,
  };
}

export type UseAudioRta = ReturnType<typeof useAudioRta>;
