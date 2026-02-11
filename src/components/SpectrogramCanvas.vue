<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import type { ColorMap, FrequencyScale, RtaBand } from "../types/rta";
import {
    renderSpectrogram,
    renderSpectrogramColumn,
    resetSpectrogramState,
} from "../utils/spectrogramRender";

const props = defineProps<{
    bands: RtaBand[];
    bandData: Float32Array | null;
    minDb: number;
    maxDb: number;
    isPlaying: boolean;
    colorMap: ColorMap;
    frequencyScale: FrequencyScale;
    gamma: number;
    columnInterval: number;
}>();

const minFreq = 20;
const maxFreq = 20000;

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLDivElement | null>(null);

const canvasWidth = ref(800);
const canvasHeight = ref(600);

const mousePos = ref<{ x: number; y: number } | null>(null);
const hoverFrequency = ref<number | null>(null);
const isHovering = ref(false);

let animationFrameId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let lastRenderTime = 0;

const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

function posToFreq(
    pos: number,
    size: number,
    minFreq: number,
    maxFreq: number,
    scale: FrequencyScale,
): number {
    const normalized = 1 - pos / size;
    if (scale === "logarithmic") {
        const logMin = Math.log10(minFreq);
        const logMax = Math.log10(maxFreq);
        const logFreq = logMin + normalized * (logMax - logMin);
        return Math.pow(10, logFreq);
    } else {
        return minFreq + normalized * (maxFreq - minFreq);
    }
}

function formatFrequency(freq: number): string {
    if (freq >= 1000) {
        return `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)}kHz`;
    }
    return `${Math.round(freq)}Hz`;
}

function updateCanvasSize() {
    if (!containerRef.value || !canvasRef.value) return;

    const rect = containerRef.value.getBoundingClientRect();
    const newWidth = rect.width;
    const newHeight = rect.height;

    if (newWidth !== canvasWidth.value || newHeight !== canvasHeight.value) {
        canvasWidth.value = newWidth;
        canvasHeight.value = newHeight;

        canvasRef.value.width = newWidth * dpr;
        canvasRef.value.height = newHeight * dpr;

        canvasRef.value.style.width = `${newWidth}px`;
        canvasRef.value.style.height = `${newHeight}px`;
    }
}

function doRender(timestamp: number) {
    const canvas = canvasRef.value;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = canvasWidth.value;
    const height = canvasHeight.value;

    if (props.isPlaying && props.bandData && props.bandData.length > 0) {
        if (timestamp - lastRenderTime >= props.columnInterval) {
            renderSpectrogramColumn(
                props.bandData,
                props.bandData.length,
                props.minDb,
                props.maxDb,
                height,
                props.colorMap,
                props.gamma,
                props.frequencyScale,
            );
            lastRenderTime = timestamp;
        }
    }

    renderSpectrogram(
        ctx,
        width,
        height,
        props.minDb,
        true,
        props.frequencyScale,
        minFreq,
        maxFreq,
    );

    if (isHovering.value && mousePos.value && hoverFrequency.value !== null) {
        const x = mousePos.value.x;
        const y = mousePos.value.y;

        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();

        ctx.moveTo(0, y);
        ctx.lineTo(width, y);

        ctx.stroke();
        ctx.setLineDash([]);

        const label = formatFrequency(hoverFrequency.value);
        ctx.font = "14px monospace";
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = 20;
        const padding = 8;

        let labelX: number;
        let labelY: number;

        labelY = y - 30;
        if (labelY < textHeight + padding) {
            labelY = y + 20;
        }
        labelX = width - textWidth - padding * 2 - 10;

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

function renderLoop(timestamp: number) {
    doRender(timestamp);
    animationFrameId = requestAnimationFrame(renderLoop);
}

function startRenderLoop() {
    stopRenderLoop();
    animationFrameId = requestAnimationFrame(renderLoop);
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
    const y = event.clientY - rect.top;

    mousePos.value = { x, y };

    hoverFrequency.value = posToFreq(
        y,
        canvasHeight.value,
        minFreq,
        maxFreq,
        props.frequencyScale,
    );

    isHovering.value = true;
}

function handleMouseLeave() {
    isHovering.value = false;
    mousePos.value = null;
    hoverFrequency.value = null;
}

watch(
    () => props.isPlaying,
    (playing) => {
        if (!playing) {
            lastRenderTime = 0;
        }
    },
);

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
    resetSpectrogramState();
});
</script>

<template>
    <div
        ref="containerRef"
        class="spectrogram-canvas-container"
        @mousemove="handleMouseMove"
        @mouseleave="handleMouseLeave"
    >
        <canvas ref="canvasRef" class="spectrogram-canvas"></canvas>
    </div>
</template>

<style scoped>
.spectrogram-canvas-container {
    position: relative;
    width: 100%;
    flex: 1;
    background: #1a1a2e;
    overflow: hidden;
    cursor: crosshair;
    min-height: 0;
}

.spectrogram-canvas {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
}
</style>
