// components/score/VexFlowNoteBuilder.ts
//
// RESPONSIBILITY: Converts ONE IntermediateVoice into all VexFlow note objects
// needed for that voice in one measure. Pure transformation — no drawing, no DOM.
//
// ── WHERE TO ADD NEW LOGIC ──────────────────────────────────────────────────
//   • New note modifier (dynamic, fingering, trill, etc.) → add inside the
//     `for (const note of voice.notes)` loop in buildVoiceNotes()
//   • Beaming rule change (new time sig, different grouping strategy, etc.) →
//     update the beam-bucketing section at the bottom of buildVoiceNotes()
//   • Tuplet detection heuristic → update detectHeuristicTuplets() in
//     VexFlowHelpers.ts (called from here) or the flush/push logic below it
//   • Grace note rendering change → update attachGraceNotes() in VexFlowHelpers.ts
//   • Slur/tie spanning across measures → update processSlurs() in VexFlowHelpers.ts
//     (slurs) or the cross-measure tie logic at the end of buildVoiceNotes() (ties)
// ───────────────────────────────────────────────────────────────────────────

import {
    StaveNote,
    Voice,
    Beam,
    Accidental,
    Dot,
    VoiceMode,
    type Stave,
} from 'dreamflow'
import type { IntermediateStaff, IntermediateVoice } from '@/lib/score/IntermediateScore'
import {
    createStaveNote, isBeamable, addArticulation, detectHeuristicTuplets,
    attachGraceNotes, processSlurs, durationToBeats,
    type NoteData, type TieRequest, type TupletSpec, type ActiveSlurs,
} from './VexFlowHelpers'
import { vexKeyToMidi } from '@/lib/score/midiMatcher'

// ── Types ──────────────────────────────────────────────────────────

export interface BuildVoiceNotesParams {
    voice: IntermediateVoice
    staff: IntermediateStaff
    stave: Stave
    currentTrebleClef: string
    currentBassClef: string
    currentTimeSigNum: number
    currentTimeSigDen: number
    measureNumber: number
    /** Cross-measure tie state — mutated in-place (keys are resolved and removed as consumed) */
    prevMeasureLastNotes: Map<string, { staveNote: StaveNote; keyIndex: number }>
    /** Shared across all voices in the measure — new slur curves appended here */
    activeSlurs: ActiveSlurs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allCurves: any[]
    isMultiVoice: boolean
}

export interface BuildVoiceNotesResult {
    vfVoice: Voice
    beams: Beam[]
    measureTuplets: TupletSpec[]
    tieRequests: TieRequest[]
    /** Run these AFTER the master Formatter completes to get accurate XY positions. */
    coordinateExtractors: (() => void)[]
    /** Accumulated during building; handed off to measureNoteData in the caller. */
    pendingNoteData: Array<() => NoteData>
}

// ── buildVoiceNotes ────────────────────────────────────────────────

/**
 * Builds all VexFlow objects (StaveNotes, Voice, Beams, Tuplets, Ties, Slurs)
 * for a single IntermediateVoice within one measure.
 *
 * Returns a result object with everything the caller (VexFlowRenderer) needs
 * to hand to VexFlowFormatter and then draw.
 */
export function buildVoiceNotes(params: BuildVoiceNotesParams): BuildVoiceNotesResult {
    const {
        voice, staff, stave,
        currentTrebleClef, currentBassClef,
        currentTimeSigNum, currentTimeSigDen,
        measureNumber,
        prevMeasureLastNotes, activeSlurs, allCurves,
        isMultiVoice,
    } = params

    // Multi-voice: first voice stems UP (1), second stems DOWN (-1)
    // Single voice: undefined → autoStem handled per-beam by VexFlow
    const stemDir = isMultiVoice
        ? (voice.voiceIndex === Math.min(...staff.voices.map(v => v.voiceIndex)) ? 1 : -1)
        : undefined

    const staveClef = staff.staffIndex === 0 ? currentTrebleClef : currentBassClef

    const vfNotes: StaveNote[] = []
    const beamableWithBeat: Array<{ note: StaveNote; beamKey: string }> = []
    const tieRequests: TieRequest[] = []
    const coordinateExtractors: (() => void)[] = []
    const pendingNoteData: Array<() => NoteData> = []

    // Tuplet tracking (explicit XML tupletStart/Stop markers)
    let currentTupletNotes: StaveNote[] | null = null
    let currentTupletActual = 3
    let currentTupletNormal = 2
    const measureTuplets: TupletSpec[] = []

    // Maps tieKey → first note in this measure (for within-measure first-note registration)
    const currentMeasureFirstNotes = new Map<string, { staveNote: StaveNote; keyIndex: number }>()

    // ── Per-note loop ──────────────────────────────────────────────
    for (const note of voice.notes) {
        const staveNote = createStaveNote(note, staff.staffIndex, stemDir, staveClef)

        // Accidentals
        for (let ki = 0; ki < note.accidentals.length; ki++) {
            const acc = note.accidentals[ki]
            if (acc) staveNote.addModifier(new Accidental(acc), ki)
        }

        // Dots
        if (note.dots > 0) Dot.buildAndAttach([staveNote], { all: true })

        // Articulations (staccato, accent, tenuto, etc.)
        // Fermata position is handled upstream in dreamflow (always ABOVE).
        for (const artCode of note.articulations) {
            addArticulation(staveNote, artCode)
        }

        vfNotes.push(staveNote)

        // Grace notes
        if (note.graceNotes && note.graceNotes.length > 0) {
            try {
                attachGraceNotes(staveNote, note.graceNotes, staff.staffIndex, staveClef)
            } catch (e) {
                console.warn(`[GRACE] Failed to attach grace notes:`, e)
            }
        }

        // Slurs (start/stop tracking; completed curves pushed to allCurves)
        const completedCurves = processSlurs(note, staveNote, activeSlurs)
        allCurves.push(...completedCurves)

        // Explicit tuplet tracking (marked in MusicXML via <tuplet> elements)
        if (note.tupletStart) {
            currentTupletNotes = [staveNote]
            currentTupletActual = note.tupletActual || 3
            currentTupletNormal = note.tupletNormal || 2
        } else if (currentTupletNotes) {
            currentTupletNotes.push(staveNote)
        }
        if (note.tupletStop && currentTupletNotes && currentTupletNotes.length > 0) {
            measureTuplets.push({ notes: currentTupletNotes, actual: currentTupletActual, normal: currentTupletNormal, stemDirection: stemDir })
            currentTupletNotes = null
        }

        // ── Beam bucketing (per-note duration key) ─────────────────
        // Each note uses ITS OWN duration to compute beamGroupBeats so that
        // 8th-note runs and 16th-note runs in the same voice group independently.
        // String key "<beamGroupBeats>_<beatFloor>" prevents cross-duration merging.
        //
        // To change grouping rules (e.g. triplet groupings, cut-time):
        //   adjust noteBGBeats formula below.
        if (!note.isRest && isBeamable(note.duration)) {
            const noteDurBeats = durationToBeats(note.duration)
            const noteBGBeats = Math.min(Math.max(4 * noteDurBeats, 0.25), 2)
            const noteBeatFloor = Math.floor((note.beat - 1) / noteBGBeats)
            const beamKey = `${noteBGBeats}_${noteBeatFloor}`
            beamableWithBeat.push({ note: staveNote, beamKey })
        }

        // ── Cross-measure tie resolution ───────────────────────────
        if (!note.isRest) {
            for (let ki = 0; ki < note.keys.length; ki++) {
                const tieKey = `${staff.staffIndex}-${note.keys[ki]}`
                if (!currentMeasureFirstNotes.has(tieKey)) {
                    currentMeasureFirstNotes.set(tieKey, { staveNote, keyIndex: ki })
                }
                const prev = prevMeasureLastNotes.get(tieKey)
                if (prev) {
                    tieRequests.push({
                        firstNote: prev.staveNote,
                        lastNote: staveNote,
                        firstIndices: [prev.keyIndex],
                        lastIndices: [ki],
                    })
                    prevMeasureLastNotes.delete(tieKey)
                }
            }
            for (let ki = 0; ki < note.tiesToNext.length; ki++) {
                if (note.tiesToNext[ki]) {
                    const tieKey = `${staff.staffIndex}-${note.keys[ki]}`
                    prevMeasureLastNotes.set(tieKey, { staveNote, keyIndex: ki })
                }
            }
        }

        // ── Coordinate extractor (deferred until after Formatter) ──
        // Capturing staveNote + note in a closure is intentional — they are
        // per-iteration values that must be frozen for the lambda.
        const capturedNote = note
        const capturedStaveNote = staveNote
        coordinateExtractors.push(() => {
            pendingNoteData.push((): NoteData => {
                let element: HTMLElement | null = null
                let pathsAndRects: HTMLElement[] | undefined
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const svgEl = (capturedStaveNote as any).getSVGElement?.() as HTMLElement | undefined
                    if (svgEl) {
                        const group = (svgEl.closest('.vf-stavenote') as HTMLElement) || svgEl
                        element = group
                        pathsAndRects = Array.from(group.querySelectorAll('path, rect, text')) as HTMLElement[]
                    }
                } catch { /* ignore */ }

                const pitches = capturedNote.isRest ? undefined : capturedNote.keys
                    .map(k => vexKeyToMidi(k))
                    .filter((p): p is number => p !== undefined)

                return {
                    id: capturedNote.vfId,
                    measureIndex: measureNumber,
                    timestamp: (capturedNote.beat - 1) / currentTimeSigNum,
                    isRest: capturedNote.isRest,
                    numerator: currentTimeSigNum,
                    element,
                    stemElement: null,
                    pathsAndRects,
                    pitches: pitches && pitches.length > 0 ? pitches : undefined,
                    hasGrace: !!(capturedNote.graceNotes && capturedNote.graceNotes.length > 0),
                }
            })
        })
    }

    // ── Heuristic tuplet detection ────────────────────────────────
    // Catches unmarked triplets when note values overflow measure capacity.
    const heuristicTuplets = detectHeuristicTuplets(
        voice.notes, vfNotes, measureTuplets,
        currentTimeSigNum, currentTimeSigDen, measureNumber, stemDir
    )
    measureTuplets.push(...heuristicTuplets)

    // Flush any unclosed tuplet (≥2 notes — single-note unclosed = cross-measure start)
    if (currentTupletNotes && currentTupletNotes.length >= 2) {
        measureTuplets.push({ notes: currentTupletNotes, actual: currentTupletActual, normal: currentTupletNormal, stemDirection: stemDir })
    }

    // ── Within-measure ties ───────────────────────────────────────
    for (let ni = 0; ni < voice.notes.length - 1; ni++) {
        const note = voice.notes[ni]
        if (note.isRest) continue
        for (let ki = 0; ki < note.tiesToNext.length; ki++) {
            if (note.tiesToNext[ki] && ni + 1 < vfNotes.length) {
                const nextNote = voice.notes[ni + 1]
                if (nextNote && !nextNote.isRest) {
                    const matchIdx = nextNote.keys.indexOf(note.keys[ki])
                    if (matchIdx >= 0) {
                        tieRequests.push({
                            firstNote: vfNotes[ni],
                            lastNote: vfNotes[ni + 1],
                            firstIndices: [ki],
                            lastIndices: [matchIdx],
                        })
                        prevMeasureLastNotes.delete(`${staff.staffIndex}-${note.keys[ki]}`)
                    }
                }
            }
        }
    }

    // ── VexFlow Voice object ──────────────────────────────────────
    const vfVoice = new Voice({
        numBeats: currentTimeSigNum,
        beatValue: currentTimeSigDen,
    }).setMode(VoiceMode.SOFT)
    vfVoice.addTickables(vfNotes)

    // ── Beam creation ─────────────────────────────────────────────
    // Pre-bucketed by beamKey (per-note), then one Beam per bucket.
    // new Beam() used directly (not generateBeams) to avoid VexFlow re-splitting.
    // autoStem=true for single-voice → VexFlow picks consistent direction for group.
    // autoStem=false for multi-voice → stems already set by stemDir above.
    const beams: Beam[] = []
    if (beamableWithBeat.length >= 2) {
        try {
            const beatBuckets = new Map<string, StaveNote[]>()
            for (const { note: sn, beamKey } of beamableWithBeat) {
                if (!beatBuckets.has(beamKey)) beatBuckets.set(beamKey, [])
                beatBuckets.get(beamKey)!.push(sn)
            }
            const autoStem = stemDir === undefined
            for (const [, groupNotes] of beatBuckets) {
                if (groupNotes.length < 2) continue
                beams.push(new Beam(groupNotes, autoStem))
            }
        } catch { /* ignore */ }
    }

    void stave // stave param reserved for future per-voice stave access

    return { vfVoice, beams, measureTuplets, tieRequests, coordinateExtractors, pendingNoteData }
}
