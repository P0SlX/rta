<script setup lang="ts">
import { parseBlob } from "music-metadata";
import {
    onMounted,
    onUnmounted,
    ref,
    shallowRef,
    triggerRef,
    watch,
} from "vue";
import fallbackCoverUrl from "./assets/fallback-cover.svg";
import AudioPlayerControls from "./components/AudioPlayerControls.vue";
import PlayerBar from "./components/PlayerBar.vue";
import PlaylistPanel from "./components/PlaylistPanel.vue";
import RtaCanvas from "./components/RtaCanvas.vue";
import SpectrogramCanvas from "./components/SpectrogramCanvas.vue";
import SpectrogramControls from "./components/SpectrogramControls.vue";
import { useAudioRta } from "./composables/useAudioRta";
import type { PlaylistTrack, PlaylistTrackStatus } from "./types/playlist";
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
const showSettings = ref(false);
const showPlaylist = ref(false);

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

const isMobile = ref(false);

function checkMobile() {
    isMobile.value = window.innerWidth < 768;
}

onMounted(() => {
    checkMobile();
    window.addEventListener("resize", checkMobile);

    if (panelRef.value) {
        const rect = panelRef.value.getBoundingClientRect();
        panelPosition.value = {
            x: (window.innerWidth - rect.width) / 2,
            y: window.innerHeight - rect.height - 100,
        };
    }
});

onUnmounted(() => {
    window.removeEventListener("resize", checkMobile);
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

// Données de fréquence pour le rendu
const bandData = shallowRef<Float32Array | null>(null);
const peakData = shallowRef<Float32Array | null>(null);
const bands = shallowRef<RtaBand[]>([]);

const queue = ref<PlaylistTrack[]>([]);
const history = ref<PlaylistTrack[]>([]);
const currentTrack = ref<PlaylistTrack | null>(null);

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
            triggerRef(bandData);
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

const coverUrlRegistry = new Set<string>();

function registerCoverUrl(url?: string) {
    if (!url || !url.startsWith("blob:")) return;
    coverUrlRegistry.add(url);
}

function revokeCoverUrl(url?: string) {
    if (!url || !url.startsWith("blob:")) return;
    URL.revokeObjectURL(url);
    coverUrlRegistry.delete(url);
}

function revokeAllCoverUrls() {
    coverUrlRegistry.forEach((url) => URL.revokeObjectURL(url));
    coverUrlRegistry.clear();
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
    revokeAllCoverUrls();
});

function createTrackId(file: File) {
    if ("randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `${file.name}-${file.size}-${file.lastModified}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

function parseTrackInfo(fileName: string) {
    const baseName = fileName.replace(/\.[^/.]+$/, "");
    const parts = baseName.split(" - ");
    if (parts.length >= 2) {
        return {
            artist: parts[0].trim() || "Fichier local",
            title: parts.slice(1).join(" - ").trim() || baseName,
        };
    }
    return { artist: "Fichier local", title: baseName };
}

function createBaseTrack(
    file: File,
    status: PlaylistTrackStatus,
): PlaylistTrack {
    const { title, artist } = parseTrackInfo(file.name);
    return {
        id: createTrackId(file),
        title,
        artist,
        coverUrl: fallbackCoverUrl,
        status,
        file,
    };
}

function buildFormatLabel(
    format?: string,
    bitDepth?: number,
    sampleRate?: number,
    fileName?: string,
): string | undefined {
    const extension = fileName?.split(".").pop()?.trim();
    const normalizedFormat =
        format || extension
            ? String(format || extension)
                  .replace(/^audio\//, "")
                  .replace(/\s+/g, " ")
                  .trim()
            : undefined;
    const parts: string[] = [];
    if (normalizedFormat) parts.push(normalizedFormat.toUpperCase());
    if (bitDepth) parts.push(`${bitDepth} bits`);
    if (sampleRate) {
        const khz = (sampleRate / 1000).toFixed(1).replace(/\.0$/, "");
        parts.push(`${khz}Khz`);
    }
    return parts.length ? parts.join(" - ") : undefined;
}

async function enrichTrackWithMetadata(
    track: PlaylistTrack,
): Promise<PlaylistTrack> {
    if (!track.file) return track;
    try {
        const metadata = await parseBlob(track.file);
        const common = metadata.common;
        const format = metadata.format;

        const title = common.title?.trim() || track.title;
        const artist = common.artist?.trim() || track.artist;
        const album = common.album?.trim();

        let coverUrl = track.coverUrl;
        const picture = common.picture?.[0];
        if (picture?.data) {
            revokeCoverUrl(coverUrl);
            const blob = new Blob([picture.data as BlobPart], {
                type: picture.format || "image/jpeg",
            });
            coverUrl = URL.createObjectURL(blob);
            registerCoverUrl(coverUrl);
        }

        const bitDepth = format.bitsPerSample;
        const sampleRate = format.sampleRate;
        const formatLabel = buildFormatLabel(
            format.container || format.codec || track.file.type,
            bitDepth,
            sampleRate,
            track.file?.name,
        );

        return {
            ...track,
            title,
            artist,
            album,
            coverUrl,
            bitDepth,
            sampleRate,
            formatLabel,
        };
    } catch (error) {
        console.warn("Metadata parsing failed:", error);
        return track;
    }
}

async function loadTrack(track: PlaylistTrack, autoplay = false) {
    if (!track.file) return;
    try {
        await audioRta.loadFile(track.file);
        bands.value = audioRta.getBands();
        startUpdateLoop();
        if (autoplay) {
            await audioRta.play();
        }
    } catch (e) {
        console.error("Échec du chargement du fichier :", e);
    }
}

function pushToHistory(track: PlaylistTrack) {
    history.value.unshift({ ...track, status: "played" });
}

async function setCurrentTrack(track: PlaylistTrack, autoplay = false) {
    audioRta.stop();
    currentTrack.value = { ...track, status: "current" };
    await loadTrack(currentTrack.value, autoplay);
}

async function handleFilesSelected(files: File[]) {
    const baseTracks = files.map((file) => createBaseTrack(file, "upcoming"));
    const newTracks = await Promise.all(
        baseTracks.map((track) => enrichTrackWithMetadata(track)),
    );

    queue.value.push(...newTracks);

    if (!currentTrack.value) {
        const next = queue.value.shift();
        if (next) {
            await setCurrentTrack(next, false);
        }
    }
}

async function handlePlay() {
    if (!audioRta.isLoaded.value && currentTrack.value) {
        await loadTrack(currentTrack.value, true);
        return;
    }

    if (!audioRta.isLoaded.value && queue.value.length) {
        const next = queue.value.shift();
        if (next) {
            await setCurrentTrack(next, true);
        }
        return;
    }

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

function moveQueueTrack(trackId: string, direction: "up" | "down") {
    const index = queue.value.findIndex((track) => track.id === trackId);
    if (index === -1) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= queue.value.length) return;
    const updated = [...queue.value];
    [updated[index], updated[targetIndex]] = [
        updated[targetIndex],
        updated[index],
    ];
    queue.value = updated;
}

async function handleSelectTrack(trackId: string) {
    if (currentTrack.value?.id === trackId) {
        if (audioRta.isPlaying.value) {
            audioRta.pause();
        } else {
            await audioRta.play();
        }
        return;
    }

    const queueIndex = queue.value.findIndex((track) => track.id === trackId);
    const historyIndex = history.value.findIndex(
        (track) => track.id === trackId,
    );
    const selected =
        queueIndex >= 0
            ? queue.value.splice(queueIndex, 1)[0]
            : historyIndex >= 0
              ? history.value.splice(historyIndex, 1)[0]
              : null;

    if (!selected) return;
    if (currentTrack.value) {
        pushToHistory(currentTrack.value);
    }

    await setCurrentTrack(selected, true);
}

async function handleNextTrack() {
    const next = queue.value.shift();
    if (!next) return;
    if (currentTrack.value) {
        pushToHistory(currentTrack.value);
    }
    await setCurrentTrack(next, true);
}

async function handlePreviousTrack() {
    const previous = history.value.shift();
    if (!previous) return;
    if (currentTrack.value) {
        queue.value.unshift({ ...currentTrack.value, status: "upcoming" });
    }
    await setCurrentTrack(previous, true);
}

watch(
    () => audioRta.endedSignal.value,
    () => {
        void handleNextTrack();
    },
);
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
                    class="absolute md:fixed z-20 inset-0 md:inset-auto pointer-events-auto bg-[#1a1a2e]/95 backdrop-blur-xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col w-full h-full md:h-auto md:max-h-[75vh] md:w-auto md:max-w-5xl md:border-2 md:border-white/20 md:rounded-3xl"
                    :style="
                        !isMobile
                            ? {
                                  left: panelPosition.x + 'px',
                                  top: panelPosition.y + 'px',
                                  cursor: isDragging ? 'grabbing' : 'default',
                              }
                            : {}
                    "
                >
                    <!-- En-tête -->
                    <div
                        @mousedown="startDrag"
                        @touchstart="startDrag"
                        class="px-4 py-3 border-b border-white/10 flex justify-between items-center bg-white/5 select-none"
                        :style="{
                            cursor: isMobile
                                ? 'default'
                                : isDragging
                                  ? 'grabbing'
                                  : 'grab',
                        }"
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

                    <div class="flex-1 overflow-y-auto p-4 space-y-5">
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

            <!-- Panneau Playlist -->
            <transition
                enter-active-class="transition duration-300 ease-out"
                enter-from-class="opacity-0 translate-x-4"
                enter-to-class="opacity-100 translate-x-0"
                leave-active-class="transition duration-200 ease-in"
                leave-from-class="opacity-100 translate-x-0"
                leave-to-class="opacity-0 translate-x-4"
            >
                <PlaylistPanel
                    v-if="showPlaylist"
                    :current-track="currentTrack"
                    :queue="queue"
                    :history="history"
                    :is-playing="audioRta.isPlaying.value"
                    :band-data="bandData"
                    :min-db="audioRta.minDb.value"
                    :max-db="audioRta.maxDb.value"
                    @close="showPlaylist = false"
                    @select-track="handleSelectTrack"
                    @move-queue-track="moveQueueTrack"
                />
            </transition>
        </div>

        <PlayerBar
            :is-playing="audioRta.isPlaying.value"
            :is-loaded="audioRta.isLoaded.value"
            :current-time="audioRta.currentTime.value"
            :duration="audioRta.duration.value"
            :current-track="currentTrack"
            :queue="queue"
            :history="history"
            :volume="audioRta.volume.value"
            @files-selected="handleFilesSelected"
            @play="handlePlay"
            @pause="handlePause"
            @stop="handleStop"
            @seek="handleSeek"
            @next="handleNextTrack"
            @previous="handlePreviousTrack"
            @select-track="handleSelectTrack"
            @move-queue-track="moveQueueTrack"
            @toggle-settings="showSettings = !showSettings"
            @toggle-playlist="showPlaylist = !showPlaylist"
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
