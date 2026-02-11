<script setup lang="ts">
import { computed } from "vue";
import type { ColorMap, FrequencyScale } from "../types/rta";

const props = defineProps<{
    colorMap: ColorMap;
    frequencyScale: FrequencyScale;
    gamma: number;
    columnInterval: number;
}>();

const emit = defineEmits<{
    updateColorMap: [colorMap: ColorMap];
    updateFrequencyScale: [scale: FrequencyScale];
    updateGamma: [gamma: number];
    updateColumnInterval: [interval: number];
}>();

const colorMapModel = computed({
    get: () => props.colorMap,
    set: (value) => emit("updateColorMap", value),
});

const frequencyScaleModel = computed({
    get: () => props.frequencyScale,
    set: (value) => emit("updateFrequencyScale", value),
});

const gammaModel = computed({
    get: () => props.gamma,
    set: (value) => emit("updateGamma", value),
});

const columnIntervalModel = computed({
    get: () => props.columnInterval,
    set: (value) => emit("updateColumnInterval", value),
});
</script>

<template>
    <div class="flex flex-col gap-5 text-sm text-white">
        <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5"
        >
            <div class="flex flex-col gap-2">
                <label
                    class="text-xs font-bold uppercase tracking-widest text-gray-500"
                    >Palette de Couleurs</label
                >
                <div class="relative">
                    <select
                        v-model="colorMapModel"
                        class="w-full bg-white/5 text-white border border-white/10 rounded-xl px-3 py-2 appearance-none focus:border-[#00c896] focus:outline-none transition-all cursor-pointer hover:bg-white/10"
                    >
                        <option value="custom">Custom</option>
                        <option value="magma">Magma</option>
                        <option value="viridis">Viridis</option>
                        <option value="plasma">Plasma</option>
                        <option value="inferno">Inferno</option>
                        <option value="grayscale">Grayscale</option>
                    </select>
                </div>
            </div>

            <div class="flex flex-col gap-2">
                <label
                    class="text-xs font-bold uppercase tracking-widest text-gray-500"
                    >Échelle de Fréquence</label
                >
                <div class="relative">
                    <select
                        v-model="frequencyScaleModel"
                        class="w-full bg-white/5 text-white border border-white/10 rounded-xl px-3 py-2 appearance-none focus:border-[#00c896] focus:outline-none transition-all cursor-pointer hover:bg-white/10"
                    >
                        <option value="logarithmic">Logarithmique</option>
                        <option value="linear">Linéaire</option>
                    </select>
                </div>
            </div>

            <div class="flex flex-col gap-2">
                <div class="flex justify-between">
                    <label
                        class="text-xs font-bold uppercase tracking-widest text-gray-500"
                        >Gamma (Contraste)</label
                    >
                    <span class="text-[#00c896] font-mono text-sm font-bold">{{
                        gammaModel.toFixed(2)
                    }}</span>
                </div>
                <input
                    v-model.number="gammaModel"
                    type="range"
                    min="0.3"
                    max="3"
                    step="0.1"
                    class="w-full h-2 appearance-none bg-white/5 rounded-full cursor-pointer accent-[#00c896]"
                />
            </div>

            <div class="flex flex-col gap-2">
                <div class="flex justify-between">
                    <label
                        class="text-xs font-bold uppercase tracking-widest text-gray-500"
                        >Vitesse de Scrolling</label
                    >
                    <span class="text-[#00c896] font-mono text-sm font-bold"
                        >{{ columnIntervalModel }}ms</span
                    >
                </div>
                <input
                    v-model.number="columnIntervalModel"
                    type="range"
                    min="4"
                    max="32"
                    step="2"
                    class="w-full h-2 appearance-none bg-white/5 rounded-full cursor-pointer accent-[#00c896]"
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
