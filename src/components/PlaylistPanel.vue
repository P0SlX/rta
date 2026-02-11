<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import fallbackCoverUrl from "../assets/fallback-cover.svg";
import type { PlaylistTrack } from "../types/playlist";

const props = defineProps<{
    currentTrack: PlaylistTrack | null;
    queue: PlaylistTrack[];
    history: PlaylistTrack[];
    isPlaying: boolean;
    isLoadingTracks?: boolean;
    bandData?: Float32Array | null;
    minDb?: number;
    maxDb?: number;
}>();

const emit = defineEmits<{
    close: [];
    selectTrack: [trackId: string];
    moveQueueTrack: [trackId: string, direction: "up" | "down"];
}>();

const scrollContainerRef = ref<HTMLDivElement | null>(null);
const currentTrackRef = ref<HTMLDivElement | null>(null);

function handleTrackClick(trackId: string) {
    emit("selectTrack", trackId);
}

function moveTrackUp(trackId: string) {
    emit("moveQueueTrack", trackId, "up");
}

function moveTrackDown(trackId: string) {
    emit("moveQueueTrack", trackId, "down");
}
/**
 * Mini visualizer désactivé car l'animation ne me plait pas...
 */

// const MINI_BAR_COUNT = 6;
// const MINI_BAR_MIN = 2;
// const MINI_BAR_MAX = 20;
// const MINI_DB_MIN = -100;
// const MINI_DB_MAX = 0;

// const miniBars = ref<number[]>([]);
// let miniFrameId: number | null = null;

// function computeMiniBars(data: Float32Array, minDb: number, maxDb: number) {
//     const range = maxDb - minDb || 1;
//     const result = new Array<number>(MINI_BAR_COUNT);
//     const step = data.length / MINI_BAR_COUNT;
//     for (let i = 0; i < MINI_BAR_COUNT; i += 1) {
//         const index = Math.min(
//             data.length - 1,
//             Math.floor(i * step + step / 2),
//         );
//         const value = data[index];
//         const normalized = (value - minDb) / range;
//         const clamped = Math.min(1, Math.max(0, normalized));
//         result[i] = Math.max(MINI_BAR_MIN, Math.round(clamped * MINI_BAR_MAX));
//     }
//     return result;
// }

// function updateMiniBars() {
//     const data = props.bandData;
//     if (!data || data.length === 0) {
//         miniBars.value = new Array(MINI_BAR_COUNT).fill(MINI_BAR_MIN);
//         return;
//     }
//     const minDb = props.minDb ?? MINI_DB_MIN;
//     const maxDb = props.maxDb ?? MINI_DB_MAX;
//     miniBars.value = computeMiniBars(data, minDb, maxDb);
// }

// function startMiniLoop() {
//     if (miniFrameId !== null) return;
//     const tick = () => {
//         updateMiniBars();
//         miniFrameId = requestAnimationFrame(tick);
//     };
//     tick();
// }

// function stopMiniLoop() {
//     if (miniFrameId === null) return;
//     cancelAnimationFrame(miniFrameId);
//     miniFrameId = null;
// }

// watch(
//     () => props.isPlaying,
//     (playing) => {
//         if (playing) {
//             startMiniLoop();
//         } else {
//             stopMiniLoop();
//             miniBars.value = new Array(MINI_BAR_COUNT).fill(MINI_BAR_MIN);
//         }
//     },
//     { immediate: true },
// );

// onMounted(() => {
//     updateMiniBars();
//     if (props.isPlaying) {
//         startMiniLoop();
//     }
// });

// onUnmounted(() => {
//     stopMiniLoop();
// });

watch(
    () => props.currentTrack?.id,
    async () => {
        await nextTick();
        const container = scrollContainerRef.value;
        const currentEl = currentTrackRef.value;
        if (!container || !currentEl) return;
        const containerRect = container.getBoundingClientRect();
        const currentRect = currentEl.getBoundingClientRect();
        const offset = currentRect.top - containerRect.top;
        container.scrollTop += offset;
    },
    { immediate: true },
);
</script>

<template>
    <div
        class="fixed z-30 right-4 bottom-24 w-84 max-h-[70vh] bg-[#1a1a2e]/95 backdrop-blur-xl shadow-2xl shadow-black/60 border-2 border-white/20 rounded-3xl overflow-hidden flex flex-col"
    >
        <!-- En-tête -->
        <div
            class="px-4 py-2 border-b border-white/10 flex justify-between items-center bg-white/5 select-none shrink-0"
        >
            <h2
                class="text-sm font-bold uppercase tracking-[0.2em] text-gray-300"
            >
                File d'attente
            </h2>
            <button
                @click="emit('close')"
                class="text-gray-400 hover:text-white transition-colors text-2xl leading-none px-3 py-1 hover:bg-white/10 rounded-lg"
                title="Fermer"
            >
                ×
            </button>
        </div>

        <!-- Contenu scrollable -->
        <div
            ref="scrollContainerRef"
            class="flex-1 overflow-y-auto p-4 space-y-4"
        >
            <!-- Déjà écoutés -->
            <div v-if="history.length">
                <div>
                    <div
                        v-for="track in history"
                        :key="track.id"
                        class="flex items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors opacity-60 hover:opacity-100"
                    >
                        <div
                            class="h-8 w-8 rounded-lg overflow-hidden shrink-0"
                        >
                            <img
                                :src="track.coverUrl || fallbackCoverUrl"
                                :alt="track.title"
                                class="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                            />
                        </div>
                        <button
                            class="flex-1 min-w-0 text-left"
                            @click="handleTrackClick(track.id)"
                        >
                            <div class="text-sm text-white truncate">
                                {{ track.title }}
                            </div>
                            <div class="text-xs text-gray-400 truncate">
                                {{ track.artist || "Fichier local" }}
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            <!-- En cours de lecture -->
            <div
                v-if="currentTrack"
                ref="currentTrackRef"
                class="gap-2 px-2 py-2 rounded-xl bg-[#00c896]/10"
            >
                <div class="flex items-center gap-2">
                    <div class="h-10 w-10 rounded-lg overflow-hidden shrink-0">
                        <img
                            :src="currentTrack.coverUrl || fallbackCoverUrl"
                            :alt="currentTrack.title"
                            class="h-full w-full object-cover"
                            loading="lazy"
                            decoding="async"
                        />
                    </div>
                    <div class="min-w-0 flex-1">
                        <p class="text-sm text-white font-medium truncate">
                            {{ currentTrack.title }}
                        </p>
                        <p class="text-xs text-gray-400 truncate">
                            {{ currentTrack.artist || "Fichier local" }}
                        </p>
                    </div>
                    <!-- <div
                        v-if="miniBars.length"
                        class="flex items-center gap-1 h-6"
                    >
                        <div
                            v-for="(bar, index) in miniBars"
                            :key="index"
                            class="flex items-center justify-center h-6"
                        >
                            <span
                                class="block w-1 bg-[#00c896] rounded-full transition-[height] duration-200 ease-in-out"
                                :style="{ height: bar * 2 + 'px' }"
                            ></span>
                        </div>
                    </div> -->
                </div>
            </div>

            <!-- À suivre -->
            <div v-if="queue.length > 0">
                <h3
                    class="flex items-center justify-between mb-2 text-[11px] uppercase tracking-widest text-gray-500 font-bold"
                >
                    À suivre
                </h3>
                <div>
                    <div
                        v-for="(track, index) in queue"
                        :key="track.id"
                        class="flex cursor-pointer items-center gap-2 px-2 py-2 rounded-xl hover:bg-white/5 transition-colors group"
                    >
                        <div
                            class="h-10 w-10 rounded-lg overflow-hidden shrink-0"
                        >
                            <img
                                :src="track.coverUrl || fallbackCoverUrl"
                                :alt="track.title"
                                class="h-full w-full object-cover"
                                loading="lazy"
                                decoding="async"
                            />
                        </div>
                        <button
                            class="flex-1 min-w-0 text-left cursor-pointer"
                            @click="handleTrackClick(track.id)"
                        >
                            <div class="text-sm text-white truncate">
                                {{ track.title }}
                            </div>
                            <div class="text-xs text-gray-400 truncate">
                                {{ track.artist || "Fichier local" }}
                            </div>
                        </button>
                        <div
                            class="flex flex-col items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                            <button
                                class="p-1 cursor-pointer text-gray-400 hover:text-white disabled:opacity-20"
                                :disabled="index === 0"
                                @click="moveTrackUp(track.id)"
                                title="Monter"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-3 w-3"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M3 12l7-7 7 7H3z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                            </button>
                            <button
                                class="p-1 cursor-pointer text-gray-400 hover:text-white disabled:opacity-20"
                                :disabled="index === queue.length - 1"
                                @click="moveTrackDown(track.id)"
                                title="Descendre"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    class="h-3 w-3"
                                    viewBox="0 0 20 20"
                                    fill="currentColor"
                                >
                                    <path
                                        fill-rule="evenodd"
                                        d="M3 8l7 7 7-7H3z"
                                        clip-rule="evenodd"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Loader pour les fichiers en cours de chargement -->
            <div v-if="isLoadingTracks" class="mt-4">
                <div
                    class="flex items-center gap-3 px-2 py-3 rounded-xl bg-white/5 animate-pulse"
                >
                    <div
                        class="h-10 w-10 rounded-lg bg-[#00c896]/20 shrink-0 flex items-center justify-center"
                    >
                        <svg
                            class="animate-spin h-5 w-5 text-[#00c896]"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle
                                class="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                stroke-width="4"
                            ></circle>
                            <path
                                class="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            ></path>
                        </svg>
                    </div>
                    <div class="flex-1">
                        <div class="text-sm text-white/70 font-medium">
                            Chargement des métadonnées...
                        </div>
                        <div class="text-xs text-gray-500">
                            Analyse des fichiers en cours
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
