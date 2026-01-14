<script setup lang="ts">
import { computed } from "vue";
import type { DisplayMode, FftSize } from "../types/rta";

const props = defineProps<{
    error: string | null;
    fftSize: FftSize;
    sampleRate: number;
    smoothingTimeConstant: number;
    extraSmoothing: number;
    peakHold: boolean;
    peakDecay: number;
    numBands: number;
    displayMode: DisplayMode;
}>();

const emit = defineEmits<{
    updateFftSize: [size: FftSize];
    updateSmoothingTimeConstant: [value: number];
    updateExtraSmoothing: [value: number];
    updatePeakHold: [enabled: boolean];
    updatePeakDecay: [value: number];
    updateNumBands: [num: number];
    updateDisplayMode: [mode: DisplayMode];
}>();

const isSpectrogramMode = computed(() => props.displayMode === "spectrogram");

const fftSizes: FftSize[] = [512, 1024, 2048, 4096, 8192, 16384, 32768];

const hzPerBin = computed(() => props.sampleRate / props.fftSize);
const usableBins = computed(() => {
    const minFreq = 20;
    const maxFreq = Math.min(20000, props.sampleRate / 2);
    return Math.floor((maxFreq - minFreq) / hzPerBin.value);
});
const isOversampled = computed(() => props.numBands > usableBins.value);

const displayModeModel = computed({
    get: () => props.displayMode,
    set: (value) => emit("updateDisplayMode", value),
});

const fftSizeModel = computed({
    get: () => props.fftSize,
    set: (value) => emit("updateFftSize", value),
});

const numBandsModel = computed({
    get: () => props.numBands,
    set: (value) => emit("updateNumBands", value),
});

const smoothingTimeConstantModel = computed({
    get: () => props.smoothingTimeConstant,
    set: (value) => emit("updateSmoothingTimeConstant", value),
});

const extraSmoothingModel = computed({
    get: () => props.extraSmoothing,
    set: (value) => emit("updateExtraSmoothing", value),
});

const peakDecayModel = computed({
    get: () => props.peakDecay,
    set: (value) => emit("updatePeakDecay", value),
});

const peakHoldModel = computed({
    get: () => props.peakHold,
    set: (value) => emit("updatePeakHold", value),
});
</script>

<template>
    <div class="flex flex-col gap-5 text-sm text-white">
        <!-- Erreur -->
        <div
            v-if="error"
            class="bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-xl text-center font-medium"
        >
            {{ error }}
        </div>

        <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5"
        >
            <!-- Affichage -->
            <div class="flex flex-col gap-2">
                <label
                    class="text-xs font-bold uppercase tracking-widest text-gray-500"
                    >Affichage</label
                >
                <div class="relative">
                    <select
                        v-model="displayModeModel"
                        class="w-full bg-white/5 text-white border border-white/10 rounded-xl px-3 py-2 appearance-none focus:border-[#00c896] focus:outline-none transition-all cursor-pointer hover:bg-white/10"
                    >
                        <option value="bars">Barres</option>
                        <option value="line">Ligne</option>
                        <option value="spectrogram">Sonogramme</option>
                    </select>
                </div>
            </div>

            <!-- Taille FFT -->
            <div class="flex flex-col gap-2">
                <label
                    class="text-xs font-bold uppercase tracking-widest text-gray-500"
                    >Taille FFT (Résolution)</label
                >
                <div class="relative">
                    <select
                        v-model.number="fftSizeModel"
                        class="w-full bg-white/5 text-white border border-white/10 rounded-xl px-3 py-2 appearance-none focus:border-[#00c896] focus:outline-none transition-all cursor-pointer hover:bg-white/10"
                    >
                        <option
                            v-for="size in fftSizes"
                            :key="size"
                            :value="size"
                        >
                            {{ size }} échantillons
                        </option>
                    </select>
                </div>
            </div>

            <!-- Bandes -->
            <div class="flex flex-col gap-2">
                <div class="flex justify-between">
                    <label
                        class="text-xs font-bold uppercase tracking-widest text-gray-500"
                        >Nombre de Bandes</label
                    >
                    <span
                        class="font-mono text-sm font-bold"
                        :class="
                            isOversampled ? 'text-orange-400' : 'text-[#00c896]'
                        "
                        >{{ numBandsModel }}</span
                    >
                </div>
                <input
                    v-model.number="numBandsModel"
                    type="range"
                    min="16"
                    max="14844"
                    step="16"
                    class="w-full h-2 appearance-none bg-white/5 rounded-full cursor-pointer accent-[#00c896]"
                />
                <div
                    class="text-[10px] font-mono text-gray-500 flex justify-between"
                >
                    <span>{{ hzPerBin.toFixed(2) }} Hz/bin</span>
                    <span>{{ usableBins }} bins utiles</span>
                </div>
                <div
                    class="text-[10px] text-orange-400/80 mt-1"
                    :class="{ invisible: !isOversampled }"
                >
                    Bandes > bins : plusieurs bandes partagent les mêmes
                    données. Augmentez la FFT.
                </div>
            </div>

            <!-- Lissage de l'analyseur -->
            <div class="flex flex-col gap-2">
                <div class="flex justify-between">
                    <label
                        class="text-xs font-bold uppercase tracking-widest text-gray-500"
                        >Lissage Analyseur</label
                    >
                    <span class="text-[#00c896] font-mono text-sm font-bold">{{
                        smoothingTimeConstantModel.toFixed(2)
                    }}</span>
                </div>
                <input
                    v-model.number="smoothingTimeConstantModel"
                    type="range"
                    min="0"
                    max="0.99"
                    step="0.01"
                    class="w-full h-2 appearance-none bg-white/5 rounded-full cursor-pointer accent-[#00c896]"
                />
            </div>

            <!-- Lissage EMA -->
            <div v-if="!isSpectrogramMode" class="flex flex-col gap-2">
                <div class="flex justify-between">
                    <label
                        class="text-xs font-bold uppercase tracking-widest text-gray-500"
                        >Lissage EMA (Rendu)</label
                    >
                    <span class="text-[#00c896] font-mono text-sm font-bold">{{
                        extraSmoothingModel.toFixed(2)
                    }}</span>
                </div>
                <input
                    v-model.number="extraSmoothingModel"
                    type="range"
                    min="0"
                    max="0.95"
                    step="0.05"
                    class="w-full h-2 appearance-none bg-white/5 rounded-full cursor-pointer accent-[#00c896]"
                />
            </div>

            <!-- Déclin des crêtes -->
            <div v-if="!isSpectrogramMode" class="flex flex-col gap-2">
                <div class="flex justify-between items-center">
                    <label
                        class="flex items-center gap-1.5 cursor-pointer group"
                    >
                        <input
                            v-model="peakHoldModel"
                            type="checkbox"
                            class="w-5 h-5 rounded border-white/10 bg-white/5 accent-[#00c896]"
                        />
                        <span
                            class="text-xs font-bold uppercase tracking-widest text-gray-500 group-hover:text-white transition-colors"
                            >Maintien des Crêtes</span
                        >
                    </label>
                    <span
                        v-if="peakHoldModel"
                        class="text-[#00c896] font-mono text-sm font-bold"
                        >{{ peakDecayModel.toFixed(3) }}</span
                    >
                </div>
                <input
                    v-model.number="peakDecayModel"
                    type="range"
                    min="0.9"
                    max="0.999"
                    step="0.001"
                    :disabled="!peakHoldModel"
                    class="w-full h-2 appearance-none bg-white/5 rounded-full cursor-pointer accent-[#00c896] disabled:opacity-20"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    background: #00c896;
    border-radius: 50%;
    cursor: pointer;
    border: 3px solid #1a1a2e;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
}

input[type="range"]::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: #00c896;
    border-radius: 50%;
    cursor: pointer;
    border: 3px solid #1a1a2e;
}
</style>
