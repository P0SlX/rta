<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
    volume: number;
    disabled?: boolean;
}>();

const emit = defineEmits<{
    volumeChange: [value: number];
}>();

const showSlider = ref(false);
const isDragging = ref(false);

const volumeIcon = computed(() => {
    if (props.volume === 0) return "muted";
    if (props.volume < 0.5) return "low";
    return "high";
});

function handleVolumeChange(event: Event) {
    const input = event.target as HTMLInputElement;
    emit("volumeChange", parseFloat(input.value));
}

function toggleMute() {
    if (props.disabled) return;
    emit("volumeChange", props.volume > 0 ? 0 : 1);
}

function handleMouseEnter() {
    if (!props.disabled) {
        showSlider.value = true;
    }
}

function handleMouseLeave() {
    if (!isDragging.value) {
        showSlider.value = false;
    }
}

function handleMouseDown() {
    isDragging.value = true;
}

function handleMouseUp() {
    isDragging.value = false;
    if (!showSlider.value) {
        showSlider.value = false;
    }
}
</script>

<template>
    <div
        class="relative"
        @mouseenter="handleMouseEnter"
        @mouseleave="handleMouseLeave"
    >
        <transition
            enter-active-class="transition-all duration-200 ease-out"
            enter-from-class="opacity-0 translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition-all duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 translate-y-2"
        >
            <div
                v-show="showSlider"
                class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-[#1a1a2e]/98 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl"
                @mousedown="handleMouseDown"
                @mouseup="handleMouseUp"
            >
                <div class="relative h-32 w-8 flex items-center justify-center">
                    <div
                        class="absolute w-2 h-full bg-white/5 rounded-full overflow-hidden"
                    >
                        <div
                            class="absolute bottom-0 w-full bg-[#00c896]"
                            :style="{ height: volume * 100 + '%' }"
                        />
                    </div>

                    <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        :value="volume"
                        :disabled="disabled"
                        @input="handleVolumeChange"
                        class="volume-slider"
                        orient="vertical"
                    />
                </div>
            </div>
        </transition>

        <button
            class="p-3 bg-white/5 hover:bg-white/10 text-white rounded-xl transition-all border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            :disabled="disabled"
            @click="toggleMute"
            :title="volume > 0 ? 'Couper le son' : 'Activer le son'"
        >
            <svg
                v-if="volumeIcon === 'high'"
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
                    d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
            </svg>

            <svg
                v-else-if="volumeIcon === 'low'"
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
                    d="M15.536 8.464a5 5 0 010 7.072M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
            </svg>

            <svg
                v-else
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
                    d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                    clip-rule="evenodd"
                />
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"
                />
            </svg>
        </button>
    </div>
</template>

<style scoped>
.volume-slider {
    -webkit-appearance: slider-vertical;
    appearance: slider-vertical;
    writing-mode: bt-lr;
    width: 100%;
    height: 100%;
    background: transparent;
    cursor: pointer;
    position: relative;
    z-index: 10;
}

/* Webkit browsers (Chrome, Safari, Edge) */
.volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 18px;
    height: 18px;
    background: #00c896;
    border-radius: 50%;
    cursor: pointer;
    border: 3px solid #1a1a2e;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
}

/* Firefox */
.volume-slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: #00c896;
    border-radius: 50%;
    cursor: pointer;
    border: 3px solid #1a1a2e;
}

.volume-slider::-webkit-slider-runnable-track {
    background: transparent;
}

.volume-slider::-moz-range-track {
    background: transparent;
}
</style>
