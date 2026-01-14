<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import AudioPlayerControls from "./components/AudioPlayerControls.vue";
import PlayerBar from "./components/PlayerBar.vue";
import RtaCanvas from "./components/RtaCanvas.vue";
import SpectrogramCanvas from "./components/SpectrogramCanvas.vue";
import SpectrogramControls from "./components/SpectrogramControls.vue";
import { useAudioRta } from "./composables/useAudioRta";
import type {
    ColorMap,
    DisplayMode,
    FftSize,
    FrequencyScale,
    RtaBand,
    SpectrogramDirection,
} from "./types/rta";

const audioRta = useAudioRta();

const displayMode = ref<DisplayMode>("bars");
const showStats = ref(false);
const showSettings = ref(false);

const spectrogramColorMap = ref<ColorMap>("custom");
const spectrogramFrequencyScale = ref<FrequencyScale>("logarithmic");
const spectrogramDirection = ref<SpectrogramDirection>("horizontal");
const spectrogramGamma = ref(1.0);
const spectrogramColumnInterval = ref(16);

// Panneau des options
const panelRef = ref<HTMLElement | null>(null);
const isDragging = ref(false);
const panelPosition = ref({ x: 0, y: 0 });
const dragStart = ref({ x: 0, y: 0 });

// Panneau des stats
const statsPanelRef = ref<HTMLElement | null>(null);
const isDraggingStats = ref(false);
const statsPanelPosition = ref({ x: 20, y: 20 });
const dragStartStats = ref({ x: 0, y: 0 });

onMounted(() => {
    if (panelRef.value) {
        const rect = panelRef.value.getBoundingClientRect();
        panelPosition.value = {
            x: (window.innerWidth - rect.width) / 2,
            y: window.innerHeight - rect.height - 100,
        };
    }
});

function startDrag(event: MouseEvent | TouchEvent) {
    isDragging.value = true;
    const clientX =
        "touches" in event ? event.touches[0].clientX : event.clientX;
    const clientY =
        "touches" in event ? event.touches[0].clientY : event.clientY;

    dragStart.value = {
        x: clientX - panelPosition.value.x,
        y: clientY - panelPosition.value.y,
    };

    window.addEventListener("mousemove", onDrag);
    window.addEventListener("mouseup", stopDrag);
    window.addEventListener("touchmove", onDrag);
    window.addEventListener("touchend", stopDrag);
}

function onDrag(event: MouseEvent | TouchEvent) {
    if (!isDragging.value || !panelRef.value) return;

    const clientX =
        "touches" in event ? event.touches[0].clientX : event.clientX;
    const clientY =
        "touches" in event ? event.touches[0].clientY : event.clientY;

    const rect = panelRef.value.getBoundingClientRect();
    let newX = clientX - dragStart.value.x;
    let newY = clientY - dragStart.value.y;

    // Garde le panneau dans les limites de la fenêtre
    const margin = 20;
    newX = Math.max(
        margin,
        Math.min(newX, window.innerWidth - rect.width - margin),
    );
    newY = Math.max(
        margin,
        Math.min(newY, window.innerHeight - rect.height - margin),
    );

    panelPosition.value = { x: newX, y: newY };
}

function stopDrag() {
    isDragging.value = false;
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", stopDrag);
    window.removeEventListener("touchmove", onDrag);
    window.removeEventListener("touchend", stopDrag);
}

function startDragStats(event: MouseEvent | TouchEvent) {
    isDraggingStats.value = true;
    const clientX =
        "touches" in event ? event.touches[0].clientX : event.clientX;
    const clientY =
        "touches" in event ? event.touches[0].clientY : event.clientY;

    dragStartStats.value = {
        x: clientX - statsPanelPosition.value.x,
        y: clientY - statsPanelPosition.value.y,
    };

    window.addEventListener("mousemove", onDragStats);
    window.addEventListener("mouseup", stopDragStats);
    window.addEventListener("touchmove", onDragStats);
    window.addEventListener("touchend", stopDragStats);
}

function onDragStats(event: MouseEvent | TouchEvent) {
    if (!isDraggingStats.value || !statsPanelRef.value) return;

    const clientX =
        "touches" in event ? event.touches[0].clientX : event.clientX;
    const clientY =
        "touches" in event ? event.touches[0].clientY : event.clientY;

    const rect = statsPanelRef.value.getBoundingClientRect();
    let newX = clientX - dragStartStats.value.x;
    let newY = clientY - dragStartStats.value.y;

    // Garde le panneau dans les limites de la fenêtre
    const margin = 20;
    newX = Math.max(
        margin,
        Math.min(newX, window.innerWidth - rect.width - margin),
    );
    newY = Math.max(
        margin,
        Math.min(newY, window.innerHeight - rect.height - margin),
    );

    statsPanelPosition.value = { x: newX, y: newY };
}

function stopDragStats() {
    isDraggingStats.value = false;
    window.removeEventListener("mousemove", onDragStats);
    window.removeEventListener("mouseup", stopDragStats);
    window.removeEventListener("touchmove", onDragStats);
    window.removeEventListener("touchend", stopDragStats);
}

// Données de fréquence pour le rendu
const bandData = shallowRef<Float32Array | null>(null);
const peakData = shallowRef<Float32Array | null>(null);
const bands = shallowRef<RtaBand[]>([]);

let bandDataBuffer: Float32Array | null = null;
let peakDataBuffer: Float32Array | null = null;
let animationFrameId: number | null = null;

function updateFrequencyData() {
    const currentBands = audioRta.getBands();
    if (currentBands.length > 0 && currentBands.length !== bands.value.length) {
        bands.value = currentBands;
        bandDataBuffer = new Float32Array(currentBands.length);
        peakDataBuffer = new Float32Array(currentBands.length);
    }

    const data = audioRta.getFrequencyData();
    if (data) {
        if (bandDataBuffer && bandDataBuffer.length === data.bands.length) {
            bandDataBuffer.set(data.bands);
            bandData.value = bandDataBuffer;
        } else {
            bandDataBuffer = new Float32Array(data.bands);
            bandData.value = bandDataBuffer;
        }

        if (peakDataBuffer && peakDataBuffer.length === data.peaks.length) {
            peakDataBuffer.set(data.peaks);
            peakData.value = peakDataBuffer;
        } else {
            peakDataBuffer = new Float32Array(data.peaks);
            peakData.value = peakDataBuffer;
        }
    }
}

function startUpdateLoop() {
    if (animationFrameId !== null) return;
    const update = () => {
        if (audioRta.isPlaying.value) {
            updateFrequencyData();
        }
        animationFrameId = requestAnimationFrame(update);
    };
    update();
}

function stopUpdateLoop() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

watch(
    () => audioRta.isLoaded.value,
    (loaded) => {
        if (loaded) {
            bands.value = audioRta.getBands();
            startUpdateLoop();
        }
    },
);

onUnmounted(() => {
    stopUpdateLoop();
});

async function handleFileSelected(file: File) {
    try {
        await audioRta.loadFile(file);
        bands.value = audioRta.getBands();
        startUpdateLoop();
    } catch (e) {
        console.error("Échec du chargement du fichier :", e);
    }
}

async function handlePlay() {
    await audioRta.play();
}
function handlePause() {
    audioRta.pause();
}
function handleStop() {
    audioRta.stop();
    bandData.value = null;
    peakData.value = null;
}
function handleSeek(time: number) {
    audioRta.seek(time);
}
function handleUpdateFftSize(size: FftSize) {
    audioRta.updateFftSize(size);
    bands.value = audioRta.getBands();
}
function handleUpdateSmoothingTimeConstant(value: number) {
    audioRta.updateSmoothingTimeConstant(value);
}
function handleUpdateExtraSmoothing(value: number) {
    audioRta.updateExtraSmoothing(value);
}
function handleUpdatePeakHold(enabled: boolean) {
    audioRta.updatePeakHold(enabled);
}
function handleUpdatePeakDecay(value: number) {
    audioRta.updatePeakDecay(value);
}
function handleUpdateNumBands(num: number) {
    audioRta.updateNumBands(num);
    bands.value = audioRta.getBands();
}
function handleUpdateDisplayMode(mode: DisplayMode) {
    displayMode.value = mode;
}

function handleUpdateSpectrogramColorMap(colorMap: ColorMap) {
    spectrogramColorMap.value = colorMap;
}

function handleUpdateSpectrogramFrequencyScale(scale: FrequencyScale) {
    spectrogramFrequencyScale.value = scale;
}

function handleUpdateSpectrogramDirection(direction: SpectrogramDirection) {
    spectrogramDirection.value = direction;
}

function handleUpdateSpectrogramGamma(gamma: number) {
    spectrogramGamma.value = gamma;
}

function handleUpdateSpectrogramColumnInterval(interval: number) {
    spectrogramColumnInterval.value = interval;
}

function handleVolumeChange(value: number) {
    audioRta.setVolume(value);
}

const stats = computed(() => {
    if (!audioRta.isLoaded.value) return null;
    const avgDb = bandData.value
        ? Array.from(bandData.value).reduce((sum, val) => sum + val, 0) /
          bandData.value.length
        : audioRta.minDb.value;
    const maxDb = bandData.value
        ? Math.max(...Array.from(bandData.value))
        : audioRta.minDb.value;
    const minDb = bandData.value
        ? Math.min(...Array.from(bandData.value))
        : audioRta.minDb.value;
    const dynamicRange = maxDb - minDb;
    const rms = bandData.value
        ? Math.sqrt(
              Array.from(bandData.value)
                  .map((val) => Math.pow(10, val / 10))
                  .reduce((sum, val) => sum + val, 0) / bandData.value.length,
          )
        : 0;
    const rmsDb = rms > 0 ? 10 * Math.log10(rms) : audioRta.minDb.value;

    return {
        fileName: audioRta.fileName.value,
        sampleRate: audioRta.sampleRate.value,
        bitDepth: "32-bit Float",
        duration: audioRta.duration.value,
        fftSize: audioRta.fftSize.value,
        bufferSize: audioRta.fftSize.value / 2,
        frequencyBins: audioRta.fftSize.value / 2,
        bands: audioRta.numBands.value,
        freqResolution: (
            audioRta.sampleRate.value / audioRta.fftSize.value
        ).toFixed(2),
        avgDb: avgDb.toFixed(1),
        peakDb: maxDb.toFixed(1),
        floorDb: minDb.toFixed(1),
        dynamicRange: dynamicRange.toFixed(1),
        rmsDb: rmsDb.toFixed(1),
        bandsLength: bands.value.length,
        dataLength: bandData.value ? bandData.value.length : 0,
        peakDataLength: peakData.value ? peakData.value.length : 0,
    };
});
</script>

<template>
    <div
        class="h-screen w-screen bg-[#0a0a0f] overflow-hidden flex flex-col font-sans text-white"
    >
        <div class="relative flex-1 min-h-0 w-full">
            <!-- Visualiseur -->
            <RtaCanvas
                v-if="displayMode !== 'spectrogram'"
                class="absolute inset-0 w-full h-full"
                :bands="bands"
                :band-data="bandData"
                :peak-data="peakData"
                :display-mode="displayMode"
                :min-db="audioRta.minDb.value"
                :max-db="audioRta.maxDb.value"
                :peak-hold="audioRta.peakHold.value"
                :current-time="audioRta.currentTime.value"
                :duration="audioRta.duration.value"
                :is-playing="audioRta.isPlaying.value"
            />
            <SpectrogramCanvas
                v-else
                class="absolute inset-0 w-full h-full"
                :bands="bands"
                :band-data="bandData"
                :min-db="audioRta.minDb.value"
                :max-db="audioRta.maxDb.value"
                :is-playing="audioRta.isPlaying.value"
                :color-map="spectrogramColorMap"
                :frequency-scale="spectrogramFrequencyScale"
                :direction="spectrogramDirection"
                :gamma="spectrogramGamma"
                :column-interval="spectrogramColumnInterval"
            />

            <!-- Panneau -->
            <transition
                enter-active-class="transition duration-300 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-200 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
            >
                <div
                    v-if="showSettings"
                    ref="panelRef"
                    class="fixed pointer-events-auto w-full max-w-5xl bg-[#1a1a2e]/95 backdrop-blur-xl border-2 border-white/20 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-[75vh]"
                    :style="{
                        left: panelPosition.x + 'px',
                        top: panelPosition.y + 'px',
                        cursor: isDragging ? 'grabbing' : 'default',
                    }"
                >
                    <!-- En-tête -->
                    <div
                        @mousedown="startDrag"
                        @touchstart="startDrag"
                        class="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/5 select-none"
                        :style="{ cursor: isDragging ? 'grabbing' : 'grab' }"
                    >
                        <h2
                            class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300"
                        >
                            Configuration
                        </h2>
                        <button
                            @click="showSettings = false"
                            class="text-gray-400 hover:text-white transition-colors text-2xl leading-none px-3 py-1 hover:bg-white/10 rounded-lg"
                            title="Fermer"
                        >
                            ×
                        </button>
                    </div>

                    <div class="overflow-y-auto p-4 space-y-5">
                        <!-- Composant Contrôles Audio (Curseurs/Réglages) -->
                        <AudioPlayerControls
                            :error="audioRta.error.value"
                            :fft-size="audioRta.fftSize.value"
                            :sample-rate="audioRta.sampleRate.value"
                            :smoothing-time-constant="
                                audioRta.smoothingTimeConstant.value
                            "
                            :extra-smoothing="audioRta.extraSmoothing.value"
                            :peak-hold="audioRta.peakHold.value"
                            :peak-decay="audioRta.peakDecay.value"
                            :num-bands="audioRta.numBands.value"
                            :display-mode="displayMode"
                            @update-fft-size="handleUpdateFftSize"
                            @update-smoothing-time-constant="
                                handleUpdateSmoothingTimeConstant
                            "
                            @update-extra-smoothing="handleUpdateExtraSmoothing"
                            @update-peak-hold="handleUpdatePeakHold"
                            @update-peak-decay="handleUpdatePeakDecay"
                            @update-num-bands="handleUpdateNumBands"
                            @update-display-mode="handleUpdateDisplayMode"
                            @stats-toggle="showStats = !showStats"
                        />

                        <!-- Composant Contrôles Spectrogramme -->
                        <SpectrogramControls
                            v-if="displayMode === 'spectrogram'"
                            :color-map="spectrogramColorMap"
                            :frequency-scale="spectrogramFrequencyScale"
                            :direction="spectrogramDirection"
                            :gamma="spectrogramGamma"
                            :column-interval="spectrogramColumnInterval"
                            @update-color-map="handleUpdateSpectrogramColorMap"
                            @update-frequency-scale="
                                handleUpdateSpectrogramFrequencyScale
                            "
                            @update-direction="handleUpdateSpectrogramDirection"
                            @update-gamma="handleUpdateSpectrogramGamma"
                            @update-column-interval="
                                handleUpdateSpectrogramColumnInterval
                            "
                        />
                    </div>
                </div>
            </transition>

            <!-- Panneau Stats -->
            <transition
                enter-active-class="transition duration-300 ease-out"
                enter-from-class="opacity-0 scale-95"
                enter-to-class="opacity-100 scale-100"
                leave-active-class="transition duration-200 ease-in"
                leave-from-class="opacity-100 scale-100"
                leave-to-class="opacity-0 scale-95"
            >
                <div
                    v-if="showStats && stats"
                    ref="statsPanelRef"
                    class="fixed pointer-events-auto w-full max-w-2xl bg-[#1a1a2e]/95 backdrop-blur-xl border-2 border-white/20 rounded-3xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col"
                    :style="{
                        left: statsPanelPosition.x + 'px',
                        top: statsPanelPosition.y + 'px',
                        cursor: isDraggingStats ? 'grabbing' : 'default',
                    }"
                >
                    <div
                        @mousedown="startDragStats"
                        @touchstart="startDragStats"
                        class="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/5 select-none"
                        :style="{
                            cursor: isDraggingStats ? 'grabbing' : 'grab',
                        }"
                    >
                        <h2
                            class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300"
                        >
                            Statistiques
                        </h2>
                        <button
                            @click="showStats = false"
                            class="text-gray-400 hover:text-white transition-colors text-2xl leading-none px-3 py-1 hover:bg-white/10 rounded-lg"
                            title="Fermer"
                        >
                            ×
                        </button>
                    </div>

                    <div class="p-4">
                        <div
                            class="grid grid-cols-2 gap-x-5 gap-y-3 font-mono text-[11px]"
                        >
                            <div
                                v-for="(val, label) in {
                                    Fichier: stats.fileName,
                                    'Fréq. Échantillonnage':
                                        stats.sampleRate + 'Hz',
                                    'Niveau de Crête': stats.peakDb + 'dB',
                                    RMS: stats.rmsDb + 'dB',
                                    FFT: stats.fftSize,
                                    Bandes: stats.bands,
                                    Dynamique: stats.dynamicRange + 'dB',
                                }"
                                :key="label"
                                class="flex flex-col border-l-2 border-white/20 pl-4"
                            >
                                <span class="text-gray-500 mb-1">{{
                                    label
                                }}</span>
                                <span class="text-white truncate">{{
                                    val
                                }}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </transition>
        </div>

        <PlayerBar
            :is-playing="audioRta.isPlaying.value"
            :is-loaded="audioRta.isLoaded.value"
            :current-time="audioRta.currentTime.value"
            :duration="audioRta.duration.value"
            :file-name="audioRta.fileName.value"
            :volume="audioRta.volume.value"
            @file-selected="handleFileSelected"
            @play="handlePlay"
            @pause="handlePause"
            @stop="handleStop"
            @seek="handleSeek"
            @toggle-settings="showSettings = !showSettings"
            @toggle-stats="showStats = !showStats"
            @volume-change="handleVolumeChange"
        />
    </div>
</template>

<style>
/* Barre de défilement pour les réglages */
.overflow-y-auto::-webkit-scrollbar {
    width: 6px;
}
.overflow-y-auto::-webkit-scrollbar-track {
    background: transparent;
}
.overflow-y-auto::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 10px;
}
.overflow-y-auto::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.2);
}
</style>
