export interface PreserveCanvasResizeOptions {
    cssWidth: number;
    cssHeight: number;
    dpr: number;
    backgroundColor?: string;
    contextAttributes?: CanvasRenderingContext2DSettings;
}

export interface PreserveCanvasResizeResult {
    resized: boolean;
    cssWidth: number;
    cssHeight: number;
    backingWidth: number;
    backingHeight: number;
}

function createScratchCanvas(
    width: number,
    height: number,
): OffscreenCanvas | HTMLCanvasElement {
    if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(width, height);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
}

function createScaledSnapshot(
    source: HTMLCanvasElement,
    width: number,
    height: number,
    backgroundColor?: string,
): OffscreenCanvas | HTMLCanvasElement | null {
    const snapshot = createScratchCanvas(width, height);
    const ctx = snapshot.getContext("2d") as
        | CanvasRenderingContext2D
        | OffscreenCanvasRenderingContext2D
        | null;

    if (!ctx) return null;

    if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, width, height);
    }

    if (source.width > 0 && source.height > 0) {
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(source, 0, 0, width, height);
    }

    return snapshot;
}

export function resizeCanvasPreservingContent(
    canvas: HTMLCanvasElement,
    options: PreserveCanvasResizeOptions,
): PreserveCanvasResizeResult {
    const dpr = Number.isFinite(options.dpr) && options.dpr > 0 ? options.dpr : 1;
    const cssWidth = Math.max(0, options.cssWidth);
    const cssHeight = Math.max(0, options.cssHeight);
    const backingWidth = Math.max(1, Math.round(cssWidth * dpr));
    const backingHeight = Math.max(1, Math.round(cssHeight * dpr));
    const resized =
        canvas.width !== backingWidth || canvas.height !== backingHeight;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    if (!resized) {
        return { resized, cssWidth, cssHeight, backingWidth, backingHeight };
    }

    const snapshot = createScaledSnapshot(
        canvas,
        backingWidth,
        backingHeight,
        options.backgroundColor,
    );

    // Changer width/height efface le canvas. On le fait seulement après avoir
    // préparé une image temporaire à la taille finale, puis on la redessine
    // immédiatement pour éviter qu'un frame vide soit présenté par le navigateur.
    canvas.width = backingWidth;
    canvas.height = backingHeight;

    const ctx = canvas.getContext("2d", options.contextAttributes);
    if (ctx && snapshot) {
        ctx.drawImage(snapshot, 0, 0);
    }

    return { resized, cssWidth, cssHeight, backingWidth, backingHeight };
}
