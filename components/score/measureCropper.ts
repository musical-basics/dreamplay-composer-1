// components/score/measureCropper.ts
//
// Captures measures from the VexFlow render using a hidden Canvas-backend
// re-render. The SVG backend can't be reliably rasterized because
// html2canvas doesn't handle FontFace-loaded SVG text (SMuFL/PUA glyphs
// render as boxes). The Canvas backend uses ctx.fillText() directly,
// which works with loaded fonts.

import type { IntermediateScore } from '@/lib/score/IntermediateScore'

const PADDING = 8
const SCALE = 2

/**
 * Re-render the score using VexFlow's Canvas backend into a hidden canvas,
 * then crop each measure from it. This bypasses all SVG font issues.
 *
 * @param score - The IntermediateScore to render
 * @param measureXMap - Measure X positions from the SVG render
 * @param measureWidthMap - Measure widths from the SVG render
 * @param systemY - System Y bounds { top, height }
 * @param onCapture - Callback for each captured measure
 */
export async function captureAllMeasures(
    score: IntermediateScore,
    measureXMap: Map<number, number>,
    measureWidthMap: Map<number, number>,
    systemY: { top: number; height: number },
    onCapture: (measureNum: number, pngDataUrl: string) => void,
): Promise<void> {
    // Dynamically import VexFlow to create a Canvas-backend render
    const { VexFlow, Renderer } = await import('dreamflow')
    const { getMeasureWidth, STAVE_Y_TREBLE, STAVE_SPACING, LEFT_MARGIN, SYSTEM_HEIGHT } = await import('./VexFlowHelpers')

    // Wait for fonts
    await document.fonts.ready

    // Compute total width from the measure maps
    const measures = score.measures
    const FIRST_MEASURE_EXTRA = 60
    const measureWidths = measures.map((m, i) =>
        getMeasureWidth(m) + (i === 0 ? FIRST_MEASURE_EXTRA : 0)
    )
    let cumulativeX = LEFT_MARGIN
    const xPositions: number[] = []
    for (const w of measureWidths) {
        xPositions.push(cumulativeX)
        cumulativeX += w
    }
    const totalWidth = cumulativeX + 40

    // Create a hidden canvas element
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-99999px;top:0;'
    document.body.appendChild(container)

    try {
        const renderer = new Renderer(container, Renderer.Backends.CANVAS)
        renderer.resize(totalWidth, SYSTEM_HEIGHT)
        const context = renderer.getContext()

        // Import the rendering helpers we need
        const {
            Stave, StaveNote, Voice, Formatter, Beam, Dot,
            Accidental, StaveConnector, StaveTie,
        } = await import('dreamflow')
        const { createStaveNote, isBeamable, addArticulation, attachGraceNotes } = await import('./VexFlowHelpers')

        // Track state
        let currentTrebleClef = 'treble'
        let currentBassClef = 'bass'
        let currentKeySig = 'C'
        let currentTimeSigNum = 4
        let currentTimeSigDen = 4

        // Simplified render loop (just enough for visual capture)
        for (let mIdx = 0; mIdx < measures.length; mIdx++) {
            const measure = measures[mIdx]
            const x = xPositions[mIdx]
            const staveWidth = measureWidths[mIdx]

            if (measure.keySignature) currentKeySig = measure.keySignature
            if (measure.timeSignatureNumerator) currentTimeSigNum = measure.timeSignatureNumerator
            if (measure.timeSignatureDenominator) currentTimeSigDen = measure.timeSignatureDenominator

            const trebleStave = new Stave(x, STAVE_Y_TREBLE, staveWidth)
            const bassStave = new Stave(x, STAVE_Y_TREBLE + STAVE_SPACING, staveWidth)

            for (const staff of measure.staves) {
                if (staff.staffIndex === 0 && staff.clef) currentTrebleClef = staff.clef
                if (staff.staffIndex === 1 && staff.clef) currentBassClef = staff.clef
            }

            if (mIdx === 0) {
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

            const staveMap: Record<number, typeof trebleStave> = { 0: trebleStave, 1: bassStave }

            // Render notes per staff/voice
            for (const staff of measure.staves) {
                const stave = staveMap[staff.staffIndex]
                if (!stave) continue
                const clef = staff.staffIndex === 0 ? currentTrebleClef : currentBassClef

                const vfVoices: InstanceType<typeof Voice>[] = []
                const allBeamableNotes: InstanceType<typeof StaveNote>[][] = []

                for (const voice of staff.voices) {
                    const staveNotes: InstanceType<typeof StaveNote>[] = []

                    for (const note of voice.notes) {
                        const staveNote = createStaveNote(note, staff.staffIndex, undefined, clef)
                        if (note.dots > 0) Dot.buildAndAttach([staveNote], { all: true })

                        for (let ki = 0; ki < note.accidentals.length; ki++) {
                            const acc = note.accidentals[ki]
                            if (acc) staveNote.addModifier(new Accidental(acc), ki)
                        }

                        for (const artCode of note.articulations) {
                            addArticulation(staveNote, artCode)
                        }

                        if (note.graceNotes && note.graceNotes.length > 0) {
                            attachGraceNotes(staveNote, note.graceNotes, staff.staffIndex, clef)
                        }

                        staveNotes.push(staveNote)
                    }

                    // Collect beamable groups
                    let currentGroup: InstanceType<typeof StaveNote>[] = []
                    for (const sn of staveNotes) {
                        // Get the duration string from the note's intrinsicTicks or duration
                        const dur = (sn as any).duration ?? ''
                        if (isBeamable(dur)) {
                            currentGroup.push(sn)
                        } else {
                            if (currentGroup.length >= 2) allBeamableNotes.push([...currentGroup])
                            currentGroup = []
                        }
                    }
                    if (currentGroup.length >= 2) allBeamableNotes.push([...currentGroup])

                    const vfVoice = new Voice({
                        numBeats: currentTimeSigNum,
                        beatValue: currentTimeSigDen,
                    }).setMode(Voice.Mode.SOFT)
                    vfVoice.addTickables(staveNotes)
                    vfVoices.push(vfVoice)
                }

                if (vfVoices.length > 0) {
                    const formatter = new Formatter()
                    const maxNoteStartX = stave.getNoteStartX()
                    let noteEndX: number
                    try { noteEndX = stave.getNoteEndX() } catch { noteEndX = maxNoteStartX + staveWidth - 40 }
                    const availableWidth = noteEndX - maxNoteStartX - 10
                    formatter.format(vfVoices, Math.max(availableWidth, 100))

                    for (const v of vfVoices) {
                        v.draw(context, stave)
                    }

                    // Draw beams
                    for (const group of allBeamableNotes) {
                        try {
                            new Beam(group, true).setContext(context).draw()
                        } catch { /* skip failed beams */ }
                    }
                }
            }
        }

        // Now crop each measure from the canvas
        const canvas = container.querySelector('canvas')
        if (!canvas) return

        for (const [measureNum] of measureXMap) {
            const mx = measureXMap.get(measureNum)!
            const mw = measureWidthMap.get(measureNum)!
            const cropX = Math.max(0, mx - PADDING)
            const cropY = Math.max(0, systemY.top - PADDING)
            const cropW = mw + PADDING * 2
            const cropH = systemY.height + PADDING * 2

            const cropCanvas = document.createElement('canvas')
            cropCanvas.width = cropW * SCALE
            cropCanvas.height = cropH * SCALE
            const ctx = cropCanvas.getContext('2d')
            if (!ctx) continue

            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height)
            ctx.drawImage(
                canvas,
                cropX, cropY, cropW, cropH,
                0, 0, cropW * SCALE, cropH * SCALE,
            )
            onCapture(measureNum, cropCanvas.toDataURL('image/png'))
        }
    } finally {
        document.body.removeChild(container)
    }
}

/**
 * Capture a single measure. Convenience wrapper.
 */
export async function captureSingleMeasure(
    score: IntermediateScore,
    measureNum: number,
    measureXMap: Map<number, number>,
    measureWidthMap: Map<number, number>,
    systemY: { top: number; height: number },
): Promise<string | null> {
    let result: string | null = null
    await captureAllMeasures(
        score, measureXMap, measureWidthMap, systemY,
        (m, png) => { if (m === measureNum) result = png },
    )
    return result
}
