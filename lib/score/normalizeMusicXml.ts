// lib/score/normalizeMusicXml.ts
//
// MusicXML preprocessing pipeline — fixes common issues in exports from
// notation editors (Sibelius, Finale, MuseScore) before parsing into
// IntermediateScore. Each fix is a pure function that mutates the DOM
// Document in place and returns it.

// ─── Individual Fixes ─────────────────────────────────────────────

/** Articulation types that should be placed relative to stem direction */
const STEM_RELATIVE_ARTICULATIONS = new Set([
    'staccato',
    'tenuto',
    'accent',
    'strong-accent',
    'staccatissimo',
    'spiccato',
    'stress',
    'unstress',
    'detached-legato',    // staccato + tenuto combined
    'breath-mark',
])

/**
 * Fix articulation placement based on stem direction.
 *
 * Many notation editors export <staccato/>, <tenuto/>, etc. without a
 * `placement` attribute. The correct engraving convention:
 *   - stem down → articulation above (on top of notehead)
 *   - stem up   → articulation below (under the notehead)
 *
 * Fermatas are excluded — they always go above regardless of stem.
 */
function fixArticulationPlacement(doc: Document): Document {
    const notes = doc.querySelectorAll('note')

    for (const note of notes) {
        const stem = note.querySelector('stem')
        const articulations = note.querySelector('notations > articulations')
        if (!stem || !articulations) continue

        const stemDir = stem.textContent?.trim()
        let placement: string | null = null
        if (stemDir === 'down') placement = 'above'
        else if (stemDir === 'up') placement = 'below'
        else continue

        for (const art of articulations.children) {
            if (STEM_RELATIVE_ARTICULATIONS.has(art.tagName)) {
                // Only set if not already specified by the editor
                if (!art.hasAttribute('placement')) {
                    art.setAttribute('placement', placement)
                }
            }
        }
    }

    return doc
}

// ─── Pipeline ─────────────────────────────────────────────────────

/** All normalization steps, applied in order */
const NORMALIZATION_STEPS = [
    fixArticulationPlacement,
    // Add future fixes here:
    // fixMissingClefs,
    // fixRestPositions,
    // fixBeamGrouping,
]

/**
 * Run the full MusicXML normalization pipeline on a parsed XML Document.
 * Mutates the document in place and returns it.
 *
 * Call this after DOMParser and before any note iteration.
 */
export function normalizeMusicXml(doc: Document): Document {
    for (const step of NORMALIZATION_STEPS) {
        step(doc)
    }
    return doc
}
