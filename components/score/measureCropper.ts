// components/score/measureCropper.ts
//
// Captures a single measure from the VexFlow SVG by:
// 1. Cloning the SVG
// 2. Embedding font-face data from document.fonts (so music glyphs render)
// 3. Setting viewBox to crop to the measure
// 4. Rasterizing via Image + Canvas

const PADDING = 8
const SCALE = 2

/**
 * Build @font-face CSS rules by extracting loaded FontFace entries
 * and re-fetching their source URLs (base64 data URIs from dreamflow).
 */
async function buildFontFaceCSS(): Promise<string> {
    const rules: string[] = []

    // Import font data directly from dreamflow's font modules
    // These export base64 data URIs like "data:font/woff2;charset=utf-8;base64,..."
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fontImport = async (p: string): Promise<any> => import(/* webpackIgnore: true */ p)
        const [bravuraMod, acadMod, acadBoldMod] = await Promise.all([
            fontImport('dreamflow/build/esm/src/fonts/bravura.js'),
            fontImport('dreamflow/build/esm/src/fonts/academico.js'),
            fontImport('dreamflow/build/esm/src/fonts/academicobold.js'),
        ])
        const Bravura = bravuraMod?.Bravura as string | undefined
        const Academico = acadMod?.Academico as string | undefined
        const AcademicoBold = acadBoldMod?.AcademicoBold as string | undefined

        if (Bravura) {
            rules.push(`@font-face { font-family: "Bravura"; src: url("${Bravura}") format("woff2"); }`)
        }
        if (Academico) {
            rules.push(`@font-face { font-family: "Academico"; src: url("${Academico}") format("woff2"); }`)
        }
        if (AcademicoBold) {
            rules.push(`@font-face { font-family: "Academico"; font-weight: bold; src: url("${AcademicoBold}") format("woff2"); }`)
        }
    } catch (err) {
        console.warn('[measureCropper] Could not import dreamflow font modules:', err)
    }

    return rules.join('\n')
}

// Cache the font CSS so we only build it once
let fontCSSCache: string | null = null

/**
 * Capture a single measure from the VexFlow SVG as a base64 PNG.
 * Embeds font data directly into the SVG clone so music glyphs render
 * correctly when rasterized via Image + Canvas.
 *
 * @param svgElement - The live SVG element from VexFlowRenderer's container
 * @param measureX - X position of the measure (from measureXMap)
 * @param measureWidth - Width of the measure (from measureWidthMap)
 * @param systemY - System Y bounds (from systemYMap: { top, height })
 * @returns base64 PNG data URL
 */
export async function captureMeasure(
    svgElement: SVGSVGElement,
    measureX: number,
    measureWidth: number,
    systemY: { top: number; height: number },
): Promise<string> {
    // Build font CSS (cached after first call)
    if (fontCSSCache === null) {
        fontCSSCache = await buildFontFaceCSS()
    }

    // Clone the SVG
    const clone = svgElement.cloneNode(true) as SVGSVGElement

    // Inject font-face CSS into the SVG
    if (fontCSSCache) {
        const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style')
        styleEl.textContent = fontCSSCache
        clone.insertBefore(styleEl, clone.firstChild)
    }

    // Set viewBox to crop to the measure
    const vbX = Math.max(0, measureX - PADDING)
    const vbY = Math.max(0, systemY.top - PADDING)
    const vbW = measureWidth + PADDING * 2
    const vbH = systemY.height + PADDING * 2
    clone.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`)
    clone.setAttribute('width', String(vbW * SCALE))
    clone.setAttribute('height', String(vbH * SCALE))

    // Remove any inline styles on the clone root that might interfere
    clone.removeAttribute('style')

    // Serialize to blob URL
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(clone)
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)

    // Rasterize via Image + Canvas
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
            URL.revokeObjectURL(blobUrl)
            resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = () => {
            URL.revokeObjectURL(blobUrl)
            reject(new Error('Failed to rasterize SVG'))
        }
        img.src = blobUrl
    })
}
