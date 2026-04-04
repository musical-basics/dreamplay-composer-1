// components/score/VexFlowFormatter.ts
//
// RESPONSIBILITY: Takes fully-built VexFlow note objects for one measure and
// runs the format + draw pipeline. No note creation, no DOM caching.
//
// ── WHERE TO ADD NEW LOGIC ──────────────────────────────────────────────────
//   • Note spacing / layout changes → update formatAndDrawMeasure(), specifically
//     the formatter.format() call or the note-start X synchronization block
//   • Articulation repositioning rules (e.g. new articulation positions) →
//     update the post-format articulation loop inside formatAndDrawMeasure()
//   • Tuplet visual appearance (brackets, number size, position offset) →
//     update the tuplet draw loop at the bottom of formatAndDrawMeasure()
//   • Proportional spacing for tuplets → update the pre-draw XShift block
//   • Adding a new type of musical ornament that needs draw-time positioning →
//     add a post-format pass similar to the articulation repositioning block
// ───────────────────────────────────────────────────────────────────────────

import {
    Voice,
    Formatter,
    Tuplet,
    type Stave,
    type RenderContext,
} from 'dreamflow'
import { STAVE_WIDTH } from './VexFlowHelpers'
import type { TupletSpec } from './VexFlowHelpers'

// ── Types ──────────────────────────────────────────────────────────

export interface FormatAndDrawParams {
    vfVoices: Voice[]
    voiceStaveMap: Map<Voice, Stave>
    multiVoiceVoices: Set<Voice>
    staveMap: { [staffIdx: number]: Stave }
    measureTuplets: TupletSpec[]
    measureNumber: number
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    measureBeams: any[]
    context: RenderContext
    /** The SVG container element, needed for tuplet text scale transformation. */
    svgContainer: HTMLElement | null
}

// ── formatAndDrawMeasure ───────────────────────────────────────────

/**
 * Formats all voices for one measure (joining same-stave voices, synchronizing
 * note-start X positions across staves, applying proportional tuplet spacing),
 * then draws voices, beams, and tuplets to the SVG context.
 *
 * Must be called AFTER all voices for the measure have been built and added
 * to voiceStaveMap, and BEFORE coordinate extractors are run.
 */
export function formatAndDrawMeasure(params: FormatAndDrawParams): void {
    const {
        vfVoices, voiceStaveMap, staveMap,
        measureTuplets, measureNumber,
        measureBeams, context, svgContainer,
    } = params

    if (vfVoices.length === 0) return

    const formatter = new Formatter()

    // Group voices by stave and join them (enables collision/cross-staff adjustment)
    const voicesByStave = new Map<Stave, Voice[]>()
    vfVoices.forEach(v => {
        const stave = voiceStaveMap.get(v)!
        if (!voicesByStave.has(stave)) voicesByStave.set(stave, [])
        voicesByStave.get(stave)!.push(v)
    })
    voicesByStave.forEach(voices => formatter.joinVoices(voices))

    // ── Tuplet objects ─────────────────────────────────────────────
    // Created BEFORE formatting so VexFlow adjusts tick counts correctly.
    // Note: VexFlow v5 Tuplet constructor does NOT modify ticks itself,
    //       so we manually apply the tick ratio first.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vfTuplets: any[] = []
    measureTuplets.forEach(t => {
        try {
            for (const note of t.notes) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const n = note as any
                    n.applyTickMultiplier(t.normal, t.actual)
                } catch { /* ignore */ }
            }
            // Explicitly set tuplet number location based on stem direction:
            // stem up (1) → number above beam; stem down (-1) → number below beam
            const tupletLocation = t.stemDirection === -1 ? -1 : 1
            const tuplet = new Tuplet(t.notes, {
                numNotes: t.actual,
                notesOccupied: t.normal,
                bracketed: false,
                location: tupletLocation,
            })
            vfTuplets.push(tuplet)
        } catch { /* ignore */ }
    })

    // ── Note-start X synchronization ──────────────────────────────
    // Ensures beats align vertically across treble and bass staves even when
    // one stave has extra decorations (clef change, key sig, grace notes).
    const staves = Object.values(staveMap)
    const maxNoteStartX = Math.max(...staves.map(s => {
        try { return s.getNoteStartX() } catch { return 0 }
    }))
    staves.forEach(s => {
        try {
            if (s.getNoteStartX() < maxNoteStartX) s.setNoteStartX(maxNoteStartX)
        } catch { /* ignore */ }
    })

    // ── Format ────────────────────────────────────────────────────
    // Available width = stave note area minus a 10px right margin.
    // Falls back to STAVE_WIDTH-40 if getNoteEndX() throws.
    const noteEndX = Math.min(...staves.map(s => {
        try { return s.getNoteEndX() } catch { return maxNoteStartX + STAVE_WIDTH - 40 }
    }))
    const availableWidth = noteEndX - maxNoteStartX - 10
    formatter.format(vfVoices, Math.max(availableWidth, 100))

    // ── Post-format: articulation repositioning ────────────────────
    // Places non-fermata articulations on the notehead side:
    //   stem up   → notehead below → articulation BELOW (VF position 4)
    //   stem down → notehead above → articulation ABOVE (VF position 3)
    // Fermatas are always ABOVE (handled upstream in dreamflow, skipped here).
    vfVoices.forEach(v => {
        const tickables = v.getTickables()
        for (const t of tickables) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sn = t as any
            try {
                const stemDir = sn.getStemDirection()
                const mods = sn.getModifiers()
                for (const m of mods) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const mod = m as any
                    if (mod.getCategory?.() === 'articulations' || mod.constructor?.name === 'Articulation') {
                        if (mod.isFermata) continue
                        const pos = stemDir === 1 ? 4 : 3
                        mod.setPosition(pos)
                        mod.setYShift(pos === 3 ? -2 : 2)
                    }
                }
            } catch { /* ignore */ }
        }
    })

    // ── Pre-draw: proportional tuplet spacing ─────────────────────
    // Applies XShift to notes inside tuplet measures for even spacing.
    // Must happen BEFORE draw() so beams and stems render at correct X.
    // Dampen factor 0.65 = pure proportional is too tight for triplets visually.
    if (measureTuplets.length > 0) {
        vfVoices.forEach(v => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const tickables = v.getTickables() as any[]
            if (tickables.length < 2) return
            try {
                const relPositions: number[] = []
                const tickValues: number[] = []
                for (const t of tickables) {
                    const tc = t.getTickContext?.()
                    relPositions.push(tc?.getX?.() ?? 0)
                    tickValues.push(t.getTicks?.()?.value?.() ?? 2048)
                }
                const firstX = relPositions[0]
                const lastX = relPositions[relPositions.length - 1]
                const totalWidth = lastX - firstX
                if (totalWidth <= 0) return

                const totalTicks = tickValues.reduce((s, t) => s + t, 0)
                let accumulated = 0
                for (let i = 0; i < tickables.length; i++) {
                    const targetX = firstX + (accumulated / totalTicks) * totalWidth
                    const shift = (targetX - relPositions[i]) * 0.65
                    accumulated += tickValues[i]
                    if (Math.abs(shift) >= 1) {
                        try { tickables[i].setXShift(shift) } catch { /* ignore */ }
                    }
                }
            } catch (e) { console.warn(`[TUPLET-SPACE] M${measureNumber} error:`, e) }
        })
    }

    // ── Draw voices, beams ────────────────────────────────────────
    vfVoices.forEach(v => v.draw(context, voiceStaveMap.get(v)!))
    measureBeams.forEach(b => b.setContext(context).draw())

    // ── Draw tuplets ──────────────────────────────────────────────
    // Scale(0.65) on the text element reduces the visual size of the number.
    // Centering is handled upstream in dreamflow's Tuplet implementation.
    const svgEl = svgContainer?.querySelector('svg') ?? null
    vfTuplets.forEach(t => {
        try {
            const textCountBefore = svgEl ? svgEl.querySelectorAll('text').length : 0
            t.setContext(context).draw()
            if (svgEl) {
                const allTexts = svgEl.querySelectorAll('text')
                for (let i = textCountBefore; i < allTexts.length; i++) {
                    const textEl = allTexts[i]
                    const origX = parseFloat(textEl.getAttribute('x') || '0')
                    const origY = parseFloat(textEl.getAttribute('y') || '0')
                    textEl.setAttribute('transform', `scale(0.65)`)
                    textEl.setAttribute('x', String(origX / 0.65))
                    textEl.setAttribute('y', String((origY + 20) / 0.65))
                    textEl.setAttribute('text-anchor', 'middle')
                }
            }
        } catch { /* ignore */ }
    })
}
