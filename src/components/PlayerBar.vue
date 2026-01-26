<script setup lang="ts">
import { computed, ref } from "vue";
import fallbackCoverUrl from "../assets/fallback-cover.svg";
import type { PlaylistTrack } from "../types/playlist";
import VolumeSlider from "./VolumeSlider.vue";

const props = defineProps<{
    isPlaying: boolean;
    isLoaded: boolean;
    currentTime: number;
    duration: number;
    currentTrack: PlaylistTrack | null;
    queue: PlaylistTrack[];
    history: PlaylistTrack[];
    volume: number;
}>();

const emit = defineEmits<{
    filesSelected: [files: File[]];
    play: [];
    pause: [];
    stop: [];
    seek: [time: number];
    next: [];
    previous: [];
    selectTrack: [trackId: string];
    moveQueueTrack: [trackId: string, direction: "up" | "down"];
    toggleSettings: [];
    togglePlaylist: [];
    volumeChange: [value: number];
}>();

const fileInput = ref<HTMLInputElement | null>(null);

const isPlayable = computed(
    () => props.isLoaded || !!props.currentTrack || props.queue.length > 0,
);
const showPause = computed(() => props.isLoaded && props.isPlaying);

const seekPosition = computed(() => {
    if (!props.duration) return 0;
    return (props.currentTime / props.duration) * 100;
});

const currentArtist = computed(() => {
    if (!props.currentTrack) return "";
    return props.currentTrack.artist || "Fichier local";
});

function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;
}

function openFileDialog() {
    fileInput.value?.click();
}

function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    if (files.length) {
        emit("filesSelected", files);
    }
    input.value = "";
}

function handleSeek(event: Event) {
    if (!props.isLoaded) return;
    const input = event.target as HTMLInputElement;
    const percent = parseFloat(input.value) / 100;
    emit("seek", percent * props.duration);
}
</script>

<template>
    <div
        class="w-full bg-[#1a1a2e]/95 backdrop-blur-xl border-t border-white/10 px-4 py-3 md:px-6 md:py-4 flex flex-col gap-3"
    >
        <input
            ref="fileInput"
            type="file"
            accept="audio/*,.wav,.mp3,.aac,.m4a,.ogg,.flac"
            multiple
            @change="handleFileSelect"
            hidden
        />

        <!-- Ligne principale -->
        <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
            <!-- Section track -->
            <div class="flex items-center gap-3 min-w-0 lg:w-1/3">
                <div
                    class="h-20 w-20 rounded-xl bg-linear-to-br from-[#00c896]/30 to-white/5 flex items-center justify-center text-xs text-white/70 font-bold uppercase overflow-hidden"
                >
                    <img
                        :src="props.currentTrack?.coverUrl || fallbackCoverUrl"
                        :alt="props.currentTrack?.title || 'Cover'"
                        class="h-full w-full object-cover"
                    />
                </div>
                <div class="min-w-0">
                    <p
                        class="text-sm font-semibold text-white truncate"
                        :title="props.currentTrack?.title || 'Aucune piste'"
                    >
                        {{ props.currentTrack?.title || "" }}
                    </p>
                    <div
                        class="flex items-center gap-2 text-xs text-gray-400 truncate"
                    >
                        <span class="truncate">{{ currentArtist }}</span>
                        <span
                            v-if="props.currentTrack?.album"
                            class="text-gray-500"
                        >
                            •
                        </span>
                        <span v-if="props.currentTrack?.album" class="truncate">
                            {{ props.currentTrack.album }}
                        </span>
                    </div>
                    <div
                        v-if="props.currentTrack?.formatLabel"
                        class="mt-1 inline-flex items-center rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/80"
                    >
                        {{ props.currentTrack.formatLabel }}
                    </div>
                </div>
            </div>

            <!-- Section contrôles -->
            <div class="flex flex-col items-center gap-3 lg:w-1/3">
                <div class="flex items-center gap-3">
                    <button
                        class="p-2 text-white/80 hover:text-white"
                        :disabled="!isPlayable || !history.length"
                        @click="emit('previous')"
                        title="Piste précédente"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path
                                d="M7 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zm10.5 0a1 1 0 0 1 1.5.86v10.28a1 1 0 0 1-1.5.86l-8-5.14a1 1 0 0 1 0-1.72l8-5.14z"
                            />
                        </svg>
                    </button>

                    <button
                        class="p-2 md:p-3 bg-[#00c896] hover:bg-[#00daa8] text-black rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-[#00c896]/10 flex items-center justify-center w-11 h-11 cursor-pointer"
                        :disabled="!isPlayable"
                        @click="showPause ? emit('pause') : emit('play')"
                        title="Lecture / Pause"
                    >
                        <svg
                            v-if="showPause"
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-6 w-6"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M10 9v6m4-6v6"
                            />
                        </svg>
                        <svg
                            v-else
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-6 w-6 ml-0.5"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                        >
                            <path
                                fill-rule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                                clip-rule="evenodd"
                            />
                        </svg>
                    </button>

                    <button
                        class="p-2 text-white/80 hover:text-white"
                        :disabled="!isPlayable || !queue.length"
                        @click="emit('next')"
                        title="Piste suivante"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            class="h-5 w-5"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <path
                                d="M17 6a1 1 0 0 1 1 1v10a1 1 0 1 1-2 0V7a1 1 0 0 1 1-1zM6.5 6a1 1 0 0 1 1.5-.86l8 5.14a1 1 0 0 1 0 1.72l-8 5.14A1 1 0 0 1 6 16.14V6.86A1 1 0 0 1 6.5 6z"
                            />
                        </svg>
                    </button>
                </div>

                <!-- Barre de progression -->
                <div class="w-full flex items-center gap-3">
                    <span
                        class="font-mono text-gray-400 text-xs w-10 text-right"
                    >
                        {{ formatTime(currentTime) }}
                    </span>
                    <div class="relative flex-1 h-6 flex items-center group">
                        <div
                            class="absolute w-full h-1.5 bg-white/10 rounded-full overflow-hidden"
                        >
                            <div
                                class="h-full bg-[#00c896] transition-[width] duration-150 ease-linear"
                                :style="{ width: seekPosition + '%' }"
                            ></div>
                        </div>

                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="0.1"
                            :value="seekPosition"
                            :disabled="!props.isLoaded"
                            class="absolute w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                            @input="handleSeek"
                        />

                        <div
                            v-if="isPlayable"
                            class="absolute h-3.5 w-3.5 bg-white rounded-full shadow pointer-events-none transition-[left,transform] duration-150 ease-linear group-hover:scale-125"
                            :style="{
                                left: seekPosition + '%',
                                transform: 'translateX(-50%)',
                            }"
                        ></div>
                    </div>
                    <span class="font-mono text-gray-400 text-xs w-10">
                        {{ formatTime(duration) }}
                    </span>
                </div>
            </div>

            <!-- Section utilitaires -->
            <div
                class="flex items-center justify-between gap-4 lg:w-1/3 lg:justify-end"
            >
                <button
                    class="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/5 cursor-pointer relative"
                    @click="openFileDialog"
                    title="Ajouter des pistes"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M12 4v16m8-8H4"
                        />
                    </svg>
                </button>
                <VolumeSlider
                    class="hidden md:block"
                    :volume="volume"
                    @volume-change="(value) => emit('volumeChange', value)"
                />

                <button
                    class="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/5 cursor-pointer relative"
                    @click="emit('togglePlaylist')"
                    title="File d'attente"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4 6h16M4 10h16M4 14h10m-10 4h6"
                        />
                    </svg>
                    <span
                        v-if="queue.length"
                        class="absolute -top-1 -right-1 bg-[#00c896] text-black text-[10px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1"
                    >
                        {{ queue.length > 99 ? "99+" : queue.length }}
                    </span>
                </button>

                <button
                    class="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/5 group cursor-pointer"
                    @click="emit('toggleSettings')"
                    title="Réglages"
                >
                    <svg
                        class="w-5 h-5 transition-transform group-hover:rotate-90 duration-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                    </svg>
                </button>
            </div>
        </div>
    </div>
</template>
