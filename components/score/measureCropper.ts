// components/score/measureCropper.ts
//
// Crops a single measure from the full VexFlow SVG render by cloning the SVG,
// setting a viewBox to the measure's bounding box, and rasterizing to a PNG
// data URL suitable for sending to Claude Vision.

const PADDING = 8 // px padding around the cropped measure

/**
 * Crop a single measure from the VexFlow SVG and return it as a base64 PNG.
 *
 * @param svgElement - The rendered SVG element from VexFlowRenderer's container
 * @param measureX - X position of the measure (from measureXMap)
 * @param measureWidth - Width of the measure (from measureWidthMap)
 * @param systemY - System Y bounds (from systemYMap: { top, height })
 * @returns base64 PNG data URL of the cropped measure
 */
export async function cropMeasure(
    svgElement: SVGSVGElement,
    measureX: number,
    measureWidth: number,
    systemY: { top: number; height: number },
): Promise<string> {
    // Clone the SVG so we don't mutate the live render
    const clone = svgElement.cloneNode(true) as SVGSVGElement

    // Set viewBox to crop to the measure's bounding box (with padding)
    const vbX = Math.max(0, measureX - PADDING)
    const vbY = Math.max(0, systemY.top - PADDING)
    const vbW = measureWidth + PADDING * 2
    const vbH = systemY.height + PADDING * 2
    clone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`)
    clone.setAttribute('width', String(vbW * 2))  // 2x for retina
    clone.setAttribute('height', String(vbH * 2))

    // Inline any @font-face rules from the document into the SVG
    // This ensures music fonts render correctly when the SVG is rasterized
    const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
    const fontRules: string[] = []
    for (const sheet of document.styleSheets) {
        try {
            for (const rule of sheet.cssRules) {
                if (rule instanceof CSSFontFaceRule) {
                    fontRules.push(rule.cssText)
                }
            }
        } catch {
            // Cross-origin stylesheets throw — skip them
        }
    }
    if (fontRules.length > 0) {
        styleEl.textContent = fontRules.join('\n')
        clone.insertBefore(styleEl, clone.firstChild)
    }

    // Serialize to a data URL
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(clone)
    const svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgString)))

    // Rasterize to canvas → PNG
    return new Promise<string>((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')
            if (!ctx) { reject(new Error('Canvas context unavailable')); return }
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(img, 0, 0)
            resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = () => reject(new Error('Failed to rasterize SVG'))
        img.src = svgDataUrl
    })
}
