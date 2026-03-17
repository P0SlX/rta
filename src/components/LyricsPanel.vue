<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";

export interface LyricLine {
    time: number;
    text: string;
}

const props = defineProps<{
    syncedLyrics?: string;
    lyrics?: string;
    currentTime: number;
    isPlaying: boolean;
}>();

const emit = defineEmits<{
    close: [];
    seek: [time: number];
    resize: [width: number];
}>();

const scrollContainerRef = ref<HTMLDivElement | null>(null);
const activeLineRef = ref<HTMLDivElement | null>(null);

const userScrolling = ref(false);
let userScrollTimeout: ReturnType<typeof setTimeout> | null = null;

const panelWidth = ref(380);
const MIN_WIDTH = 260;
const MAX_WIDTH = 700;
const isResizing = ref(false);
let resizeStartX = 0;
let resizeStartWidth = 0;

const parsedSyncedLyrics = computed<LyricLine[]>(() => {
    if (!props.syncedLyrics) return [];
    const lines: LyricLine[] = [];
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s?(.*)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(props.syncedLyrics)) !== null) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        let centiseconds = parseInt(match[3], 10);
        if (match[3].length === 2) centiseconds *= 10;
        const time = minutes * 60 + seconds + centiseconds / 1000;
        const text = match[4].trim();
        if (text.length > 0) {
            lines.push({ time, text });
        }
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
});

const plainLyricsLines = computed<string[]>(() => {
    if (!props.lyrics) return [];
    return props.lyrics.split("\n").map((l) => l.trim());
});

const hasSyncedLyrics = computed(() => parsedSyncedLyrics.value.length > 0);
const hasPlainLyrics = computed(() => plainLyricsLines.value.length > 0);
const hasAnyLyrics = computed(
    () => hasSyncedLyrics.value || hasPlainLyrics.value,
);

const activeLineIndex = computed(() => {
    if (!hasSyncedLyrics.value) return -1;
    const lines = parsedSyncedLyrics.value;
    const time = props.currentTime;
    let index = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].time <= time) {
            index = i;
        } else {
            break;
        }
    }
    return index;
});

/**
 * Vérifie si la ligne active est approximativement centrée dans le conteneur de défilement.
 * Si l'utilisateur est manuellement remonté jusqu'à centrer la ligne active,
 * on considère qu'il a "recentré" et on reprend le défilement automatique.
 */
function isActiveLineCentered(): boolean {
    const container = scrollContainerRef.value;
    const activeEl = activeLineRef.value;
    if (!container || !activeEl) return false;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const containerCenter = containerRect.top + containerRect.height / 2;
    const activeCenter = activeRect.top + activeRect.height / 2;
    const threshold = containerRect.height * 0.2;

    return Math.abs(activeCenter - containerCenter) < threshold;
}

function markUserScrolling() {
    userScrolling.value = true;
    if (userScrollTimeout) clearTimeout(userScrollTimeout);
    userScrollTimeout = setTimeout(() => {
        // Après le délai, vérifie si l'utilisateur a recentré la vue
        if (isActiveLineCentered()) {
            userScrolling.value = false;
        }
    }, 5000);
}

function handleWheel() {
    if (isResizing.value) return;
    markUserScrolling();
}

function handleTouchStart() {
    if (isResizing.value) return;
    userScrolling.value = true;
    if (userScrollTimeout) clearTimeout(userScrollTimeout);
}

function handleTouchEnd() {
    if (isResizing.value) return;
    if (userScrollTimeout) clearTimeout(userScrollTimeout);
    userScrollTimeout = setTimeout(() => {
        if (isActiveLineCentered()) {
            userScrolling.value = false;
        }
    }, 3000);
}

/**
 * Quand l'utilisateur arrête de défiler (événement scrollend), vérifie s'il a
 * manuellement ramené la ligne active au centre. Si oui, reprend le défilement automatique.
 */
function handleScrollEnd() {
    if (!userScrolling.value) return;
    if (isActiveLineCentered()) {
        userScrolling.value = false;
        if (userScrollTimeout) {
            clearTimeout(userScrollTimeout);
            userScrollTimeout = null;
        }
    }
}

function handleLineClick(line: LyricLine) {
    emit("seek", line.time);
    userScrolling.value = false;
    if (userScrollTimeout) {
        clearTimeout(userScrollTimeout);
        userScrollTimeout = null;
    }
}

function resumeAutoScroll() {
    userScrolling.value = false;
    if (userScrollTimeout) {
        clearTimeout(userScrollTimeout);
        userScrollTimeout = null;
    }
    // Défile immédiatement jusqu'à la ligne active
    scrollToActiveLine();
}

function scrollToActiveLine() {
    const container = scrollContainerRef.value;
    const activeEl = activeLineRef.value;
    if (!container || !activeEl) return;

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeEl.getBoundingClientRect();
    const targetOffset =
        activeRect.top -
        containerRect.top -
        containerRect.height / 2 +
        activeRect.height / 2;

    container.scrollBy({
        top: targetOffset,
        behavior: "smooth",
    });
}

watch(activeLineIndex, async () => {
    if (userScrolling.value) return;
    await nextTick();
    scrollToActiveLine();
});

/**
 * Réinitialise l'état et remonte en haut lors d'un changement de piste.
 * On surveille les deux sources de paroles pour couvrir tous les cas
 * (synced → plain, plain → synced, synced → synced, etc.)
 */
watch(
    () => [props.syncedLyrics, props.lyrics],
    async (_newVal, oldVal) => {
        // Ne rien faire au montage initial (oldVal undefined)
        if (oldVal === undefined) return;

        // Annuler le timeout de scroll utilisateur
        if (userScrollTimeout) {
            clearTimeout(userScrollTimeout);
            userScrollTimeout = null;
        }
        userScrolling.value = false;

        await nextTick();

        // Remonter tout en haut
        const container = scrollContainerRef.value;
        if (container) {
            container.scrollTo({ top: 0, behavior: "smooth" });
        }

        // Puis laisser le watch activeLineIndex replacer sur la bonne ligne
        // (utile si la piste démarre au milieu, ex: reprise de lecture)
    },
);

// ── Logique de redimensionnement ──────────────────────────────────────
function startResize(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    isResizing.value = true;
    resizeStartX = e.clientX;
    resizeStartWidth = panelWidth.value;
    document.addEventListener("mousemove", onResize);
    document.addEventListener("mouseup", stopResize);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
}

function onResize(e: MouseEvent) {
    if (!isResizing.value) return;

    const delta = resizeStartX - e.clientX;
    const newWidth = Math.min(
        MAX_WIDTH,
        Math.max(MIN_WIDTH, resizeStartWidth + delta),
    );
    panelWidth.value = newWidth;
    emit("resize", newWidth);
}

function stopResize() {
    isResizing.value = false;
    document.removeEventListener("mousemove", onResize);
    document.removeEventListener("mouseup", stopResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
}

onBeforeUnmount(() => {
    if (userScrollTimeout) clearTimeout(userScrollTimeout);
    document.removeEventListener("mousemove", onResize);
    document.removeEventListener("mouseup", stopResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
});
</script>

<template>
    <div
        class="h-full shrink-0 bg-[#0d0d18]/90 backdrop-blur-2xl border-l border-white/10 flex overflow-hidden relative"
        :style="{ width: panelWidth + 'px' }"
    >
        <!-- Resize -->
        <div
            class="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-30 group hover:bg-[#00c896]/30 transition-colors"
            :class="{ 'bg-[#00c896]/40': isResizing }"
            @mousedown="startResize"
        >
            <div
                class="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-white/20 group-hover:bg-[#00c896]/80 transition-colors"
                :class="{ 'bg-[#00c896]': isResizing }"
            ></div>
        </div>

        <!-- Bouton fermer -->
        <button
            @click="emit('close')"
            class="absolute top-3 right-3 z-40 text-gray-400 hover:text-white transition-colors text-2xl leading-none w-8 h-8 flex items-center justify-center hover:bg-white/10 rounded-lg cursor-pointer"
            title="Fermer"
        >
            ×
        </button>

        <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
            <div
                v-if="hasAnyLyrics"
                ref="scrollContainerRef"
                class="flex-1 overflow-y-auto overflow-x-hidden lyrics-scroll relative"
                @wheel="handleWheel"
                @touchstart="handleTouchStart"
                @touchend="handleTouchEnd"
                @scrollend="handleScrollEnd"
            >
                <!-- Paroles synchronisées -->
                <div v-if="hasSyncedLyrics" class="px-6 py-10 space-y-1">
                    <div class="h-[30vh]"></div>
                    <div
                        v-for="(line, index) in parsedSyncedLyrics"
                        :key="index"
                        :ref="
                            (el) => {
                                if (index === activeLineIndex)
                                    activeLineRef = el as HTMLDivElement;
                            }
                        "
                        class="lyrics-line cursor-pointer rounded-lg px-3 py-2 text-lg font-semibold leading-snug break-words overflow-wrap-anywhere"
                        :class="{
                            'text-white': index === activeLineIndex,
                            'text-white/30 hover:text-white/50':
                                index !== activeLineIndex,
                            'text-white/20':
                                index < activeLineIndex &&
                                index !== activeLineIndex,
                        }"
                        @click="handleLineClick(line)"
                    >
                        {{ line.text }}
                    </div>
                    <div class="h-[40vh]"></div>
                </div>

                <!-- Paroles non synchronisées -->
                <div v-else-if="hasPlainLyrics" class="px-6 py-8 space-y-0.5">
                    <p
                        v-for="(line, index) in plainLyricsLines"
                        :key="index"
                        class="text-base leading-relaxed transition-colors break-words overflow-wrap-anywhere"
                        :class="{
                            'text-white/70 font-medium': line.length > 0,
                            'h-4': line.length === 0,
                        }"
                    >
                        {{ line }}
                    </p>
                </div>
            </div>

            <!-- Bouton "Revenir au défilement auto" -->
            <transition
                enter-active-class="transition duration-200 ease-out"
                enter-from-class="opacity-0 translate-y-2 scale-95"
                enter-to-class="opacity-100 translate-y-0 scale-100"
                leave-active-class="transition duration-150 ease-in"
                leave-from-class="opacity-100 translate-y-0 scale-100"
                leave-to-class="opacity-0 translate-y-2 scale-95"
            >
                <button
                    v-if="userScrolling && hasSyncedLyrics"
                    @click="resumeAutoScroll"
                    class="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 bg-[#00c896] hover:bg-[#00daa8] text-gray-900 text-xs font-semibold rounded-full shadow-lg shadow-[#00c896]/25 cursor-pointer transition-colors"
                >
                    Suivre les paroles
                </button>
            </transition>

            <!-- Pas de paroles -->
            <div
                v-if="!hasAnyLyrics"
                class="flex-1 flex items-center justify-center"
            >
                <div class="text-center px-8">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-12 w-12 mx-auto mb-4 text-white/15"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                        />
                        <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 8h0m4 0h0m4 0h0"
                        />
                    </svg>
                    <p class="text-sm text-white/30 font-medium">
                        Aucune parole disponible
                    </p>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.lyrics-scroll::-webkit-scrollbar {
    width: 4px;
}
.lyrics-scroll::-webkit-scrollbar-track {
    background: transparent;
}
.lyrics-scroll::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.08);
    border-radius: 10px;
}
.lyrics-scroll::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.15);
}

.lyrics-line {
    transition:
        color 0.4s ease,
        opacity 0.4s ease;
}

.overflow-wrap-anywhere {
    overflow-wrap: anywhere;
}
</style>
