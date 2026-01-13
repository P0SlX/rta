<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import type { DisplayMode, RtaBand, RtaRenderConfig } from "../types/rta";
import { clearGridCache, renderRta } from "../utils/rtaRender";

const props = defineProps<{
    bands: RtaBand[];
    bandData: Float32Array | null;
    peakData: Float32Array | null;
    displayMode: DisplayMode;
    minDb: number;
    maxDb: number;
    peakHold: boolean;
    currentTime: number;
    duration: number;
    isPlaying: boolean;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

const canvasWidth = ref(800);
const canvasHeight = ref(600);

const mouseX = ref<number | null>(null);
const hoverFrequency = ref<number | null>(null);
const isHovering = ref(false);

let animationFrameId: number | null = null;

let resizeObserver: ResizeObserver | null = null;

// Ratio de pixels pour un rendu net
const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

// Convertit la position X en fréquence (logarithmique)
function xToFreq(
    x: number,
    width: number,
    minFreq: number = 20,
    maxFreq: number = 20000,
): number {
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const normalized = x / width;
    const logFreq = logMin + normalized * (logMax - logMin);
    return Math.pow(10, logFreq);
}

function formatFrequency(freq: number): string {
    if (freq >= 1000) {
        return `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)}kHz`;
    }
    return `${Math.round(freq)}Hz`;
}

// Initialise la taille du canvas
function updateCanvasSize() {
    if (!containerRef.value || !canvasRef.value) return;

    const rect = containerRef.value.getBoundingClientRect();
    canvasWidth.value = rect.width;
    canvasHeight.value = rect.height;

    canvasRef.value.width = canvasWidth.value * dpr;
    canvasRef.value.height = canvasHeight.value * dpr;

    canvasRef.value.style.width = `${canvasWidth.value}px`;
    canvasRef.value.style.height = `${canvasHeight.value}px`;

    clearGridCache();
}

function doRender() {
    const canvas = canvasRef.value;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Réinitialise la transformation et l'échelle pour le DPR
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cursorPosition =
        props.duration > 0 ? props.currentTime / props.duration : 0;

    const config: RtaRenderConfig = {
        width: canvasWidth.value,
        height: canvasHeight.value,
        displayMode: props.displayMode,
        minDb: props.minDb,
        maxDb: props.maxDb,
        minFreq: 20,
        maxFreq: 20000,
        showPeaks: props.peakHold,
        showGrid: true,
        showCursor: false,
        cursorPosition,
    };

    const bandsLength = props.bands.length || 96;
    const bandData =
        props.bandData || new Float32Array(bandsLength).fill(props.minDb);
    const peakData =
        props.peakData || new Float32Array(bandsLength).fill(props.minDb);

    renderRta(ctx, config, props.bands, bandData, peakData);

    // Dessine la ligne de la fréquence survolée et sa valeur
    if (
        isHovering.value &&
        mouseX.value !== null &&
        hoverFrequency.value !== null
    ) {
        const x = mouseX.value;

        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvasHeight.value);
        ctx.stroke();
        ctx.setLineDash([]);

        const label = formatFrequency(hoverFrequency.value);
        ctx.font = "14px monospace";
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = 20;
        const padding = 8;

        let labelX = x + 10;
        if (labelX + textWidth + padding * 2 > canvasWidth.value) {
            labelX = x - textWidth - padding * 2 - 10;
        }
        const labelY = 20;

        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(
            labelX,
            labelY,
            textWidth + padding * 2,
            textHeight + padding,
        );

        ctx.fillStyle = "#ffffff";
        ctx.fillText(
            label,
            labelX + padding,
            labelY + textHeight / 2 + padding,
        );
    }
}

function renderLoop() {
    doRender();
    animationFrameId = requestAnimationFrame(renderLoop);
}

function startRenderLoop() {
    stopRenderLoop(); // S'assure qu'aucune boucle n'est déjà en cours
    renderLoop();
}

function stopRenderLoop() {
    if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
}

function setupResizeObserver() {
    if (!containerRef.value) return;

    resizeObserver = new ResizeObserver(() => {
        updateCanvasSize();
    });

    resizeObserver.observe(containerRef.value);
}

function handleMouseMove(event: MouseEvent) {
    if (!canvasRef.value) return;

    const rect = canvasRef.value.getBoundingClientRect();
    const x = event.clientX - rect.left;

    mouseX.value = x;
    hoverFrequency.value = xToFreq(x, canvasWidth.value);
    isHovering.value = true;
}

function handleMouseLeave() {
    isHovering.value = false;
    mouseX.value = null;
    hoverFrequency.value = null;
}

watch(
    () => props.displayMode,
    () => {
        clearGridCache();
    },
);

watch([() => props.minDb, () => props.maxDb], () => {
    clearGridCache();
});

onMounted(() => {
    updateCanvasSize();
    setupResizeObserver();
    startRenderLoop();
});

onUnmounted(() => {
    stopRenderLoop();
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
});
</script>

<template>
    <div
        ref="containerRef"
        class="rta-canvas-container"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
    >
        <canvas ref="canvasRef" class="rta-canvas"></canvas>
    </div>
</template>

<style scoped>
.rta-canvas-container {
    position: relative;
    width: 100%;
    flex: 1;
    background: #1a1a2e;
    overflow: hidden;
    cursor: crosshair;
    min-height: 0;
}

.rta-canvas {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
}
</style>
