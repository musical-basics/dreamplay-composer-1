// components/score/measureCropper.ts
//
// Auto-captures all measures from the VexFlow render as PNGs.
// Uses html2canvas on a hidden off-screen container that shows each
// measure via CSS clipping of the live SVG — fonts render correctly
// because the browser has already loaded them for the live render.

const PADDING = 8
const SCALE = 2

/**
 * Capture all visible measures from the VexFlow container as PNGs.
 * Creates a temporary off-screen div for each measure, clips the SVG
 * content via CSS overflow + transform, and captures with html2canvas.
 *
 * @param container - The DOM element wrapping the VexFlow SVG
 * @param measureXMap - Map of measure number → X position
 * @param measureWidthMap - Map of measure number → width
 * @param systemY - System Y bounds { top, height }
 * @param onCapture - Callback fired for each captured measure (measureNum, pngDataUrl)
 */
export async function captureAllMeasures(
    container: HTMLElement,
    measureXMap: Map<number, number>,
    measureWidthMap: Map<number, number>,
    systemY: { top: number; height: number },
    onCapture: (measureNum: number, pngDataUrl: string) => void,
): Promise<void> {
    const svgEl = container.querySelector('svg')
    if (!svgEl) return

    const { default: html2canvas } = await import('html2canvas-pro')

    // Process each measure
    const measureNums = [...measureXMap.keys()].sort((a, b) => a - b)

    for (const m of measureNums) {
        const x = measureXMap.get(m)!
        const w = measureWidthMap.get(m)!
        const clipX = Math.max(0, x - PADDING)
        const clipY = Math.max(0, systemY.top - PADDING)
        const clipW = w + PADDING * 2
        const clipH = systemY.height + PADDING * 2

        // Create a temporary off-screen wrapper that clips to this measure
        const wrapper = document.createElement('div')
        wrapper.style.cssText = `
            position: fixed;
            left: -99999px;
            top: 0;
            width: ${clipW}px;
            height: ${clipH}px;
            overflow: hidden;
            background: white;
        `
        const inner = document.createElement('div')
        inner.style.cssText = `
            position: absolute;
            left: ${-clipX}px;
            top: ${-clipY}px;
        `
        // Clone the SVG and append — this preserves font rendering
        // because the clone inherits the document's font context
        const svgClone = svgEl.cloneNode(true) as SVGSVGElement
        inner.appendChild(svgClone)
        wrapper.appendChild(inner)
        document.body.appendChild(wrapper)

        try {
            const canvas = await html2canvas(wrapper, {
                backgroundColor: '#ffffff',
                scale: SCALE,
                useCORS: true,
                width: clipW,
                height: clipH,
            })
            onCapture(m, canvas.toDataURL('image/png'))
        } catch (err) {
            console.error(`[measureCropper] Failed to capture M${m}:`, err)
        } finally {
            document.body.removeChild(wrapper)
        }
    }
}

/**
 * Capture a single measure. Convenience wrapper around captureAllMeasures.
 */
export async function captureSingleMeasure(
    container: HTMLElement,
    measureNum: number,
    measureXMap: Map<number, number>,
    measureWidthMap: Map<number, number>,
    systemY: { top: number; height: number },
): Promise<string | null> {
    let result: string | null = null

    // Filter maps to just this measure
    const xMap = new Map([[measureNum, measureXMap.get(measureNum)!]])
    const wMap = new Map([[measureNum, measureWidthMap.get(measureNum)!]])

    await captureAllMeasures(
        container, xMap, wMap, systemY,
        (_m, png) => { result = png },
    )
    return result
}
