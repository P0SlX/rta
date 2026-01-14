<script setup lang="ts">
import { computed, ref } from "vue";
import VolumeSlider from "./VolumeSlider.vue";

const props = defineProps<{
    isPlaying: boolean;
    isLoaded: boolean;
    currentTime: number;
    duration: number;
    fileName: string;
    volume: number;
}>();

const emit = defineEmits<{
    fileSelected: [file: File];
    play: [];
    pause: [];
    stop: [];
    seek: [time: number];
    toggleSettings: [];
    toggleStats: [];
    volumeChange: [value: number];
}>();

const fileInput = ref<HTMLInputElement | null>(null);

function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

const seekPosition = computed(() => {
    if (!props.duration) return 0;
    return (props.currentTime / props.duration) * 100;
});

function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
        emit("fileSelected", file);
    }
}

function handleSeek(event: Event) {
    const input = event.target as HTMLInputElement;
    const percent = parseFloat(input.value) / 100;
    emit("seek", percent * props.duration);
}

function openFileDialog() {
    fileInput.value?.click();
}
</script>

<template>
    <div
        class="w-full bg-[#1a1a2e]/95 backdrop-blur-xl border-t border-white/10 px-4 py-3 md:px-6 md:py-4 flex flex-wrap md:flex-nowrap items-center gap-3 md:gap-6 justify-between"
    >
        <input
            ref="fileInput"
            type="file"
            accept="audio/*,.wav,.mp3,.aac,.m4a,.ogg,.flac"
            @change="handleFileSelect"
            hidden
        />

        <div class="flex items-center gap-3">
            <button
                class="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/5 group relative cursor-pointer"
                @click="openFileDialog"
                title="Charger un fichier"
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
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                </svg>
            </button>

            <!-- Play/Pause -->
            <button
                class="p-2 md:p-3 bg-[#00c896] hover:bg-[#00daa8] text-black rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-[#00c896]/10 flex items-center justify-center w-10 md:w-12 cursor-pointer"
                :disabled="!isLoaded"
                @click="isPlaying ? emit('pause') : emit('play')"
            >
                <svg
                    v-if="isPlaying"
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

            <!-- Stop -->
            <button
                class="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-white/5 cursor-pointer"
                :disabled="!isLoaded"
                @click="emit('stop')"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                        clip-rule="evenodd"
                    />
                </svg>
            </button>
        </div>

        <!-- Barre de progression -->
        <div
            class="w-full order-first md:w-auto md:order-0 md:flex-1 flex items-center gap-5 md:gap-4"
        >
            <span class="font-mono text-gray-400 text-xs w-10 text-right">{{
                formatTime(currentTime)
            }}</span>
            <div class="relative flex-1 h-6 flex items-center group">
                <div
                    class="absolute w-full h-1.5 bg-white/10 rounded-full overflow-hidden"
                >
                    <div
                        class="h-full bg-[#00c896]"
                        :style="{ width: seekPosition + '%' }"
                    ></div>
                </div>

                <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.1"
                    :value="seekPosition"
                    :disabled="!isLoaded"
                    class="absolute w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10"
                    @input="handleSeek"
                />

                <div
                    class="absolute h-3.5 w-3.5 bg-white rounded-full shadow pointer-events-none transition-transform group-hover:scale-125"
                    :style="{
                        left: seekPosition + '%',
                        transform: 'translateX(-50%)',
                    }"
                    v-if="isLoaded"
                ></div>
            </div>
            <span class="font-mono text-gray-400 text-xs w-10">{{
                formatTime(duration)
            }}</span>
        </div>

        <div class="hidden lg:flex flex-col items-end min-w-37.5 max-w-62.5">
            <span
                class="text-xs uppercase tracking-widest text-gray-500 font-bold mb-0.5"
                >En lecture</span
            >
            <span
                class="text-xs text-white font-medium truncate w-full text-right"
                :title="fileName"
            >
                {{ fileName || "Aucun fichier" }}
            </span>
        </div>

        <div class="h-8 w-px bg-white/10 mx-2 hidden lg:block"></div>

        <div class="flex items-center gap-3 md:gap-6">
            <VolumeSlider
                class="hidden md:block"
                :volume="volume"
                @volume-change="(value) => emit('volumeChange', value)"
            />

            <button
                class="p-2 md:p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                :disabled="!isLoaded"
                @click="emit('toggleStats')"
                title="Statistiques"
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
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                </svg>
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
</template>
