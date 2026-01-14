import { onUnmounted, shallowRef } from "vue";
import type { FftSize, RtaBand, RtaParams } from "../types/rta";
import { MAX_BANDS, MIN_BANDS } from "../types/rta";

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

  let frequencyData: Float32Array<ArrayBuffer> | null = null; // Données FFT brutes de l'analyseur
  let smoothedData: Float32Array<ArrayBuffer> | null = null; // Niveaux de bandes lissés par EMA
  let peakData: Float32Array<ArrayBuffer> | null = null; // Valeurs de maintien des crêtes
  let bands: RtaBand[] = []; // Définitions des bandes (hors chemin critique)

  const resultObject: FrequencyDataResult = {
    bands: new Float32Array(0), // Espace réservé, remplacé dans initializeArrays
    peaks: new Float32Array(0),
  };

  let cachedMinDb = DEFAULT_PARAMS.minDb;
  let cachedMaxDb = DEFAULT_PARAMS.maxDb;
  let cachedExtraSmoothing = DEFAULT_PARAMS.extraSmoothing;
  let cachedPeakDecay = DEFAULT_PARAMS.peakDecay;
  let cachedPeakHold = DEFAULT_PARAMS.peakHold;
  let cachedBandsLength = 0;

  let emaAlpha = 1 - cachedExtraSmoothing;
  let emaInvAlpha = cachedExtraSmoothing;

  let peakDecayComplement = 1 - cachedPeakDecay;

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
    const numBands = params.numBands;

    frequencyData = new Float32Array(size);
    smoothedData = new Float32Array(numBands);
    peakData = new Float32Array(numBands);

    const minDb = params.minDb;
    smoothedData.fill(minDb);
    peakData.fill(minDb);

    bands = calculateBands(numBands, sampleRate.value, params.fftSize);

    resultObject.bands = smoothedData;
    resultObject.peaks = peakData;

    cachedMinDb = params.minDb;
    cachedMaxDb = params.maxDb;
    cachedExtraSmoothing = params.extraSmoothing;
    cachedPeakDecay = params.peakDecay;
    cachedPeakHold = params.peakHold;
    cachedBandsLength = bands.length;

    emaAlpha = 1 - cachedExtraSmoothing;
    emaInvAlpha = cachedExtraSmoothing;
    peakDecayComplement = 1 - cachedPeakDecay;
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

  function handleEnded(): void {
    isPlaying.value = false;
    currentTime.value = 0;
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
    cachedExtraSmoothing = clamped;
    emaAlpha = 1 - clamped;
    emaInvAlpha = clamped;
  }

  function updatePeakHold(enabled: boolean): void {
    peakHold.value = enabled;
    params.peakHold = enabled;
    cachedPeakHold = enabled;
    if (!enabled && peakData) {
      peakData.fill(cachedMinDb);
    }
  }

  function updatePeakDecay(value: number): void {
    const clamped = value < 0 ? 0 : value > 1 ? 1 : value;
    peakDecay.value = clamped;
    params.peakDecay = clamped;
    cachedPeakDecay = clamped;
    peakDecayComplement = 1 - clamped;
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
    if (!analyserNode || !frequencyData || !smoothedData || !peakData) {
      return null;
    }

    const bandsLen = cachedBandsLength;
    if (bandsLen === 0) {
      return null;
    }

    // Récupération des données FFT brutes depuis l'AnalyserNode
    analyserNode.getFloatFrequencyData(frequencyData);

    const freqData = frequencyData;
    const smoothed = smoothedData;
    const peaks = peakData;
    const bandDefs = bands;
    const freqLen = freqData.length;
    const minDb = cachedMinDb;
    const maxDb = cachedMaxDb;
    const alpha = emaAlpha;
    const invAlpha = emaInvAlpha;
    const peakHold = cachedPeakHold;
    const decay = cachedPeakDecay;
    const decayComp = peakDecayComplement;

    // Traitement de chaque bande
    for (let i = 0; i < bandsLen; i++) {
      const band = bandDefs[i];
      const binStart = band.binStart;
      const binEnd = band.binEnd;

      let sum = 0;
      let count = 0;

      // Agrégation des bins pour cette bande
      for (let bin = binStart; bin <= binEnd; bin++) {
        if (bin < freqLen) {
          const value = freqData[bin];
          // value > -200 : capture les valeurs très basses qui sont... du silence
          if (value > -200 && value === value) {
            sum += value;
            count++;
          }
        }
      }

      // dB moyens pour cette bande
      const avgDb = count > 0 ? sum / count : minDb;
      const clampedAvg = avgDb < minDb ? minDb : avgDb;

      // Lissage EMA
      const prevSmoothed = smoothed[i];
      let newSmoothed = prevSmoothed * invAlpha + clampedAvg * alpha;

      // Limitation à la plage valide
      if (newSmoothed < minDb) newSmoothed = minDb;
      else if (newSmoothed > maxDb) newSmoothed = maxDb;

      smoothed[i] = newSmoothed;

      // Maintien des crêtes
      if (peakHold) {
        const currentPeak = peaks[i];
        if (newSmoothed > currentPeak) {
          peaks[i] = newSmoothed;
        } else {
          // Déclin : peak = peak * decay + minDb * (1 - decay)
          let decayedPeak = currentPeak * decay + minDb * decayComp;
          if (decayedPeak < minDb) decayedPeak = minDb;
          peaks[i] = decayedPeak;
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
