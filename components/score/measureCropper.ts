// components/score/measureCropper.ts
//
// Two-phase measure cropping:
// 1. rasterizeScore() — html2canvas the full VexFlow container once (fonts intact)
// 2. cropMeasure() — extract a measure's bounding box from the rasterized canvas
//
// This avoids SVG serialization issues where FontFace-loaded music fonts
// (Bravura, etc.) render as squares because they're not in CSS @font-face rules.

const PADDING = 8
const SCALE = 2 // retina

let cachedFullCanvas: HTMLCanvasElement | null = null
let cachedContainerWidth = 0

/**
 * Rasterize the entire VexFlow container to an off-screen canvas.
 * Call this once after VexFlowRenderer completes, then use cropMeasure()
 * to extract individual measures cheaply.
 *
 * @param container - The DOM element wrapping the VexFlow SVG
 * @returns The rasterized canvas (also cached internally)
 */
export async function rasterizeScore(container: HTMLElement): Promise<HTMLCanvasElement> {
    const { default: html2canvas } = await import('html2canvas-pro')
    const canvas = await html2canvas(container, {
        backgroundColor: '#ffffff',
        scale: SCALE,
        useCORS: true,
    })
    cachedFullCanvas = canvas
    cachedContainerWidth = container.scrollWidth
    return canvas
}

/**
 * Crop a single measure from the pre-rasterized full score canvas.
 *
 * @param measureX - X position of the measure in SVG coords (from measureXMap)
 * @param measureWidth - Width of the measure in SVG coords (from measureWidthMap)
 * @param systemY - System Y bounds in SVG coords (from systemYMap: { top, height })
 * @param fullCanvas - Optional pre-rasterized canvas (uses cached if omitted)
 * @returns base64 PNG data URL of the cropped measure
 */
export function cropMeasure(
    measureX: number,
    measureWidth: number,
    systemY: { top: number; height: number },
    fullCanvas?: HTMLCanvasElement,
): string {
    const source = fullCanvas ?? cachedFullCanvas
    if (!source) throw new Error('No rasterized score — call rasterizeScore() first')

    // SVG coords → canvas pixel coords
    // The html2canvas scale factor maps container CSS pixels to canvas pixels.
    // VexFlow SVG coords match CSS pixels 1:1 (no separate SVG viewBox scaling).
    const sx = Math.max(0, (measureX - PADDING)) * SCALE
    const sy = Math.max(0, (systemY.top - PADDING)) * SCALE
    const sw = (measureWidth + PADDING * 2) * SCALE
    const sh = (systemY.height + PADDING * 2) * SCALE

    const crop = document.createElement('canvas')
    crop.width = sw
    crop.height = sh
    const ctx = crop.getContext('2d')
    if (!ctx) throw new Error('Canvas context unavailable')

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, sw, sh)
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh)

    return crop.toDataURL('image/png')
}

/** Clear the cached full-score canvas (call when score re-renders) */
export function clearCache(): void {
    cachedFullCanvas = null
    cachedContainerWidth = 0
}
