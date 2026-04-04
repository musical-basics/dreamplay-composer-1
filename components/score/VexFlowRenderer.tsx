'use client'

// components/score/VexFlowRenderer.tsx
//
// RESPONSIBILITY: React component shell — owns lifecycle (font loading, resize),
// creates staves per measure, orchestrates the three pipeline modules, and
// collects results into the maps returned via onRenderComplete.
//
// ── WHERE TO ADD NEW LOGIC ──────────────────────────────────────────────────
//   • New note modifier, beaming rule, or tie/slur change → VexFlowNoteBuilder.ts
//   • Layout, spacing, or articulation repositioning change → VexFlowFormatter.ts
//   • Post-render DOM caching, CSS animation properties → VexFlowPostRender.ts
//   • New helper / constant / shared type → VexFlowHelpers.ts
//   • New React prop or font-loading behavior → here (VexFlowRenderer.tsx)
//   • New stave decoration (time sig change mid-score, repeat barlines) → here,
//     in the per-measure stave setup block inside renderScore()
// ───────────────────────────────────────────────────────────────────────────

import * as React from 'react'
import { useRef, useEffect, useCallback, useState } from 'react'
import { VexFlow } from 'dreamflow'
import {
    Renderer,
    Stave,
    StaveTie,
    StaveConnector,
    type RenderContext,
} from 'dreamflow'
import type { IntermediateScore } from '@/lib/score/IntermediateScore'
import {
    STAVE_Y_TREBLE, STAVE_SPACING, LEFT_MARGIN, SYSTEM_HEIGHT,
    getMeasureWidth,
    type NoteData, type VexFlowRenderResult, type ActiveSlurs,
} from './VexFlowHelpers'
import { buildVoiceNotes } from './VexFlowNoteBuilder'
import { formatAndDrawMeasure } from './VexFlowFormatter'
import { runPostRender } from './VexFlowPostRender'

export type { NoteData, VexFlowRenderResult }

interface VexFlowRendererProps {
    score: IntermediateScore | null
    onRenderComplete?: (result: VexFlowRenderResult) => void
    darkMode?: boolean
    musicFont?: string
}

// ─── Component ─────────────────────────────────────────────────────

const VexFlowRendererComponent: React.FC<VexFlowRendererProps> = ({
    score,
    onRenderComplete,
    darkMode = false,
    musicFont = '',
}) => {
    const containerRef = useRef<HTMLDivElement>(null)
    const rendererRef = useRef<Renderer | null>(null)
    const [isRendered, setIsRendered] = useState(false)
    const [fontsLoaded, setFontsLoaded] = useState(false)

    // ── Font loading ──────────────────────────────────────────────
    // Poll document.fonts until bundled music fonts (base64 URIs from dreamflow
    // entry point) appear as loaded. Falls back to CDN load if timeout exceeded.
    // document.fonts.check() gives false-positives (true when NO face matches),
    // so we iterate the FontFaceSet directly.
    useEffect(() => {
        const ensureFonts = async () => {
            console.log('[FONT DEBUG] Waiting for music fonts in document.fonts...')
            const requiredFonts = ['Bravura', 'Gonville', 'Petaluma', 'Academico']
            const maxWait = 5000
            const start = Date.now()

            while (Date.now() - start < maxWait) {
                await document.fonts.ready
                const fontFaces = [...document.fonts]
                const allReady = requiredFonts.every(name =>
                    fontFaces.some(ff => ff.family === name && ff.status === 'loaded')
                )
                if (allReady) {
                    console.log('[FONT DEBUG] All fonts confirmed in document.fonts:',
                        [...new Set(fontFaces.map(ff => ff.family))].join(', '))
                    setFontsLoaded(true)
                    return
                }
                await new Promise(r => setTimeout(r, 50))
            }

            const fontFaces = [...document.fonts]
            const missing = requiredFonts.filter(name => !fontFaces.some(ff => ff.family === name))
            console.warn('[FONT DEBUG] Timeout. Missing:', missing.join(', '))
            if (missing.length > 0) {
                try { await VexFlow.loadFonts(...missing) }
                catch (err) { console.warn('[DREAMFLOW] CDN font loading failed', err) }
            }
            setFontsLoaded(true)
        }
        ensureFonts()
    }, [])

    // ── renderScore ───────────────────────────────────────────────
    const renderScore = useCallback(() => {
        if (!score || !containerRef.current || score.measures.length === 0 || !fontsLoaded) return

        // Set active font BEFORE creating any VexFlow objects
        if (musicFont) VexFlow.setFonts(musicFont, 'Academico')
        const fontFaces = [...document.fonts]
        const targetFace = musicFont ? fontFaces.find(ff => ff.family === musicFont && ff.status === 'loaded') : null
        console.log('[FONT DEBUG] renderScore: musicFont =', JSON.stringify(musicFont),
            'FontFace found:', !!targetFace,
            'getFonts():', VexFlow.getFonts())

        containerRef.current.innerHTML = ''
        setIsRendered(false)

        const measures = score.measures

        // ── Dynamic per-measure widths ─────────────────────────────
        // See getMeasureWidth() in VexFlowHelpers.ts for the sizing formula.
        // First measure gets extra padding for clef + key sig + time sig.
        const FIRST_MEASURE_EXTRA = 60
        const measureWidths: number[] = measures.map((m, i) =>
            getMeasureWidth(m) + (i === 0 ? FIRST_MEASURE_EXTRA : 0)
        )
        const measureXPositions: number[] = []
        let cumulativeX = LEFT_MARGIN
        for (const w of measureWidths) {
            measureXPositions.push(cumulativeX)
            cumulativeX += w
        }
        const totalWidth = cumulativeX + 40

        // ── VexFlow SVG renderer ───────────────────────────────────
        const renderer = new Renderer(containerRef.current, Renderer.Backends.SVG)
        renderer.resize(totalWidth, SYSTEM_HEIGHT)
        rendererRef.current = renderer
        const context = renderer.getContext() as RenderContext

        // ── Coordinate / data maps (filled per measure) ────────────
        const measureXMap = new Map<number, number>()
        const measureWidthMap = new Map<number, number>()
        const beatXMap = new Map<number, Map<number, number>>()
        const allNoteData = new Map<number, NoteData[]>()

        // ── Running clef / key / time state ───────────────────────
        let currentTrebleClef = 'treble'
        let currentBassClef = 'bass'
        let currentKeySig = 'C'
        let currentTimeSigNum = 4
        let currentTimeSigDen = 4

        // ── Cross-measure tie / slur state ─────────────────────────
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prevMeasureLastNotes: Map<string, { staveNote: any; keyIndex: number }> = new Map()
        const activeSlurs: ActiveSlurs = new Map()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allCurves: any[] = []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allTieRequests: { firstNote: any; lastNote: any; firstIndices: number[]; lastIndices: number[] }[] = []

        // ── Per-measure render loop ────────────────────────────────
        for (let mIdx = 0; mIdx < measures.length; mIdx++) {
            const measure = measures[mIdx]
            const measureNumber = measure.measureNumber
            const x = measureXPositions[mIdx]
            const staveWidth = measureWidths[mIdx]

            if (measure.keySignature) currentKeySig = measure.keySignature
            if (measure.timeSignatureNumerator) currentTimeSigNum = measure.timeSignatureNumerator
            if (measure.timeSignatureDenominator) currentTimeSigDen = measure.timeSignatureDenominator

            // ── Stave creation ─────────────────────────────────────
            // To add new stave decorations (e.g. repeat barlines, mid-score
            // meter changes), add them here after the staves are created.
            const trebleStave = new Stave(x, STAVE_Y_TREBLE, staveWidth)
            const bassStave = new Stave(x, STAVE_Y_TREBLE + STAVE_SPACING, staveWidth)

            for (const staff of measure.staves) {
                if (staff.staffIndex === 0 && staff.clef) currentTrebleClef = staff.clef
                if (staff.staffIndex === 1 && staff.clef) currentBassClef = staff.clef
            }

            if (mIdx === 0) {
                console.log(`[VFR] M1 clefs: treble="${currentTrebleClef}" bass="${currentBassClef}"`,
                    'staves:', measure.staves.map(s => `idx${s.staffIndex}:${s.clef ?? 'undef'}`).join(', '))
                trebleStave.addClef(currentTrebleClef)
                bassStave.addClef(currentBassClef)
                if (currentKeySig && currentKeySig !== 'C' && currentKeySig !== 'Am') {
                    trebleStave.addKeySignature(currentKeySig)
                    bassStave.addKeySignature(currentKeySig)
                }
                trebleStave.addTimeSignature(`${currentTimeSigNum}/${currentTimeSigDen}`)
                bassStave.addTimeSignature(`${currentTimeSigNum}/${currentTimeSigDen}`)
            } else {
                if (measure.staves[0]?.clef) trebleStave.addClef(currentTrebleClef)
                if (measure.staves[1]?.clef) bassStave.addClef(currentBassClef)
                if (measure.keySignature && currentKeySig !== 'C' && currentKeySig !== 'Am') {
                    trebleStave.addKeySignature(currentKeySig)
                    bassStave.addKeySignature(currentKeySig)
                }
                if (measure.timeSignatureNumerator) {
                    trebleStave.addTimeSignature(`${currentTimeSigNum}/${currentTimeSigDen}`)
                    bassStave.addTimeSignature(`${currentTimeSigNum}/${currentTimeSigDen}`)
                }
            }

            trebleStave.setContext(context).draw()
            bassStave.setContext(context).draw()

            if (mIdx === 0) {
                new StaveConnector(trebleStave, bassStave).setType('brace').setContext(context).draw()
                new StaveConnector(trebleStave, bassStave).setType('singleLeft').setContext(context).draw()
            }
            new StaveConnector(trebleStave, bassStave).setType('singleRight').setContext(context).draw()

            measureXMap.set(measureNumber, x)
            measureWidthMap.set(measureNumber, staveWidth)

            const staveMap: { [staffIdx: number]: Stave } = { 0: trebleStave, 1: bassStave }

            // ── Build notes for all voices ─────────────────────────
            const vfVoices: import('dreamflow').Voice[] = []
            const multiVoiceVoices = new Set<import('dreamflow').Voice>()
            const voiceStaveMap = new Map<import('dreamflow').Voice, Stave>()
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const measureBeams: any[] = []
            const measureTuplets: import('./VexFlowHelpers').TupletSpec[] = []
            const measureBeatPositions = new Map<number, number>()
            const allCoordinateExtractors: (() => void)[] = []
            const allPendingNoteData: Array<() => NoteData> = []

            for (const staff of measure.staves) {
                const stave = staveMap[staff.staffIndex]
                if (!stave) continue
                const isMultiVoice = staff.voices.length > 1

                for (const voice of staff.voices) {
                    if (voice.notes.length === 0) continue

                    const result = buildVoiceNotes({
                        voice, staff, stave,
                        currentTrebleClef, currentBassClef,
                        currentTimeSigNum, currentTimeSigDen,
                        measureNumber,
                        prevMeasureLastNotes, activeSlurs, allCurves,
                        isMultiVoice,
                    })

                    vfVoices.push(result.vfVoice)
                    voiceStaveMap.set(result.vfVoice, stave)
                    if (isMultiVoice) multiVoiceVoices.add(result.vfVoice)
                    measureBeams.push(...result.beams)
                    measureTuplets.push(...result.measureTuplets)
                    allTieRequests.push(...result.tieRequests)
                    allCoordinateExtractors.push(...result.coordinateExtractors)
                    allPendingNoteData.push(...result.pendingNoteData)
                }
            }

            // ── Format + Draw (delegates to VexFlowFormatter.ts) ──
            formatAndDrawMeasure({
                vfVoices, voiceStaveMap, multiVoiceVoices,
                staveMap, measureTuplets, measureNumber,
                measureBeams, context,
                svgContainer: containerRef.current,
            })

            // ── Extract coordinates (post-format, pre-post-render) ─
            allCoordinateExtractors.forEach(e => e())
            const measureNoteData: NoteData[] = allPendingNoteData.map(fn => fn())

            // Record beat X positions (non-rest notes only)
            for (const note of measureNoteData) {
                if (!note.isRest && note.element) {
                    try {
                        // absoluteX not yet set; use element getBoundingClientRect stub
                        // (will be finalized in runPostRender)
                    } catch { /* ignore */ }
                }
            }

            // Use beat positions collected during buildVoiceNotes via coordinateExtractors
            // They push beat→X into measureBeatPositions via staveNote.getAbsoluteX()
            // We collect them here by re-iterating the voice notes after extraction
            for (const staff of measure.staves) {
                for (const voice of staff.voices) {
                    for (const note of voice.notes) {
                        if (!note.isRest) {
                            // Beat positions were pushed inside the coordinate extractor closures
                            // but we need the staveNote ref. Instead, use the pending note's element
                            // getBoundingClientRect approach — that happens in runPostRender.
                            // For beatXMap, we will use the staveNote absoluteX after DOM paint.
                            measureBeatPositions.set(note.beat, 0) // placeholder; overwritten in RAF
                        }
                    }
                }
            }

            beatXMap.set(measureNumber, measureBeatPositions)
            allNoteData.set(measureNumber, measureNoteData)
        }

        // ── Draw ties ──────────────────────────────────────────────
        for (const tie of allTieRequests) {
            try {
                new StaveTie({
                    firstNote: tie.firstNote,
                    lastNote: tie.lastNote,
                    firstIndexes: tie.firstIndices,
                    lastIndexes: tie.lastIndices,
                }).setContext(context).draw()
            } catch { /* tie rendering may fail for malformed notes — skip */ }
        }

        // ── Draw slurs ─────────────────────────────────────────────
        for (const curve of allCurves) {
            try { curve.setContext(context).draw() }
            catch { /* ignore */ }
        }

        // ── Post-render: CSS + absoluteX cache + callback ──────────
        // (delegates to VexFlowPostRender.ts)
        runPostRender({
            containerRef,
            allNoteData,
            measureXMap,
            measureWidthMap,
            beatXMap,
            measureCount: measures.length,
            onRenderComplete,
            setIsRendered,
        })

    }, [score, onRenderComplete, fontsLoaded, musicFont])

    // ── Render on score/font change ────────────────────────────────
    // Force a second render pass 300ms after first to let glyph shaping settle.
    // SMuFL Private Use Area characters need a second layout pass after font load.
    const [fontSettled, setFontSettled] = useState(false)
    const hasInitialRenderedRef = useRef(false)
    useEffect(() => {
        renderScore()
        if (!hasInitialRenderedRef.current && fontsLoaded && score) {
            hasInitialRenderedRef.current = true
            const timer = setTimeout(() => {
                console.log('[FONT DEBUG] Forcing post-initial re-render for glyph shaping')
                renderScore()
                setFontSettled(true)
            }, 300)
            return () => clearTimeout(timer)
        } else if (hasInitialRenderedRef.current) {
            setFontSettled(true)
        }
    }, [renderScore, fontsLoaded, score])

    // ── Resize handler ─────────────────────────────────────────────
    useEffect(() => {
        const handleResize = () => setTimeout(() => renderScore(), 500)
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [renderScore])

    return (
        <div
            ref={containerRef}
            className="vexflow-container"
            style={{
                minWidth: '100%',
                minHeight: `${SYSTEM_HEIGHT}px`,
                opacity: (isRendered && fontSettled) ? 1 : 0,
                transition: 'opacity 0.2s',
            }}
        />
    )
}

export const VexFlowRenderer = React.memo(VexFlowRendererComponent)
export default VexFlowRenderer
