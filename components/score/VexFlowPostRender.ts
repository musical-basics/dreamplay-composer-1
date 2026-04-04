// components/score/VexFlowPostRender.ts
//
// RESPONSIBILITY: After all measures have been drawn, runs a single
// requestAnimationFrame pass to:
//   1. Set CSS transition/transform properties on each note element so
//      ScrollView's animation effects work correctly.
//   2. Cache absoluteX on each NoteData for reveal-mode calculations.
//   3. Fire the onRenderComplete callback with all coordinate maps.
//
// ── WHERE TO ADD NEW LOGIC ──────────────────────────────────────────────────
//   • New CSS property needed on note elements (e.g. will-change, new transition) →
//     add to the element styling block inside runPostRender()
//   • absoluteX calculation changes (e.g. different anchor point for a note type) →
//     update the coreForX selection logic in the per-note loop
//   • New data the callback needs to return (e.g. a new coordinate map) →
//     extend VexFlowRenderResult in VexFlowHelpers.ts and pass the data here
//   • Debug logging of SVG text/font elements → update the FONT DEBUG block
//     (or remove once font loading is confirmed stable)
// ───────────────────────────────────────────────────────────────────────────

import { STAVE_Y_TREBLE, SYSTEM_HEIGHT } from './VexFlowHelpers'
import type { NoteData, VexFlowRenderResult } from './VexFlowHelpers'

export interface PostRenderParams {
    containerRef: React.RefObject<HTMLDivElement | null>
    allNoteData: Map<number, NoteData[]>
    measureXMap: Map<number, number>
    measureWidthMap: Map<number, number>
    beatXMap: Map<number, Map<number, number>>
    measureCount: number
    onRenderComplete?: (result: VexFlowRenderResult) => void
    setIsRendered: (v: boolean) => void
}

/**
 * Runs in a requestAnimationFrame after all VexFlow drawing is complete.
 * Sets CSS properties for animation, caches absoluteX, then fires onRenderComplete.
 */
export function runPostRender(params: PostRenderParams): void {
    const {
        containerRef, allNoteData,
        measureXMap, measureWidthMap, beatXMap, measureCount,
        onRenderComplete, setIsRendered,
    } = params

    requestAnimationFrame(() => {
        if (!containerRef.current) return

        const cLeft = containerRef.current.getBoundingClientRect().left

        let populatedCount = 0, missingCount = 0
        allNoteData.forEach((notes) => {
            for (const note of notes) {
                if (!note.element) { missingCount++; continue }
                populatedCount++

                // CSS transform properties on the parent element.
                // ScrollView applies scale/translateY/filter effects here.
                note.element.style.transformBox = 'fill-box'
                note.element.style.transformOrigin = 'center center'
                note.element.style.transition = 'filter 0.1s'

                // note-core child isolates structural geometry from grace-note offset.
                // Without this, transformOrigin lands on the wrong point for notes
                // that have grace notes attached (grace notes extend the bounding box left).
                const coreGroup = note.element.querySelector('.vf-note-core') as HTMLElement
                if (coreGroup) {
                    coreGroup.style.transformBox = 'fill-box'
                    coreGroup.style.transformOrigin = 'center center'
                }

                // Color transitions on note paths/rects (for highlight effects)
                if (note.pathsAndRects) {
                    note.pathsAndRects.forEach(p => {
                        p.style.transition = 'fill 0.1s, stroke 0.1s'
                    })
                }

                // Cache absoluteX using note-core if available.
                // Grace notes shift the parent's bounding box left → wrong reveal timing.
                const coreForX = note.element.querySelector('.vf-note-core') as HTMLElement
                note.absoluteX = (coreForX || note.element).getBoundingClientRect().left - cLeft
            }
        })
        console.log(`[VFR DOM] Elements: populated=${populatedCount} missing=${missingCount}`)

        // ── FONT DEBUG: inspect rendered SVG <text> elements ──────
        // Remove this block once font loading is confirmed stable across browsers.
        if (containerRef.current) {
            const svgTexts = containerRef.current.querySelectorAll('svg text')
            const first5 = Array.from(svgTexts).slice(0, 5)
            console.log(`[FONT DEBUG SVG] Total <text> elements: ${svgTexts.length}`)
            first5.forEach((el, i) => {
                const htmlEl = el as SVGTextElement
                console.log(`[FONT DEBUG SVG] text[${i}]:`,
                    'attr font-family=', htmlEl.getAttribute('font-family'),
                    '| style=', htmlEl.getAttribute('style'),
                    '| computed font-family=', window.getComputedStyle(htmlEl).fontFamily,
                    '| text=', htmlEl.textContent?.slice(0, 20))
            })
        }

        setIsRendered(true)

        if (onRenderComplete) {
            onRenderComplete({
                measureXMap,
                measureWidthMap,
                beatXMap,
                noteMap: allNoteData,
                systemYMap: {
                    top: STAVE_Y_TREBLE - 20,
                    height: SYSTEM_HEIGHT,
                },
                measureCount,
            })
        }
    })
}
