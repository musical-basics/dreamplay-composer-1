/**
 * Piano Metrics — Mathematical Coordinate System
 */

/** Standard 88-key piano: MIDI 21 (A0) to MIDI 108 (C8) */
export const MIDI_MIN = 21
export const MIDI_MAX = 108
export const TOTAL_KEYS = 88
export const WHITE_KEY_COUNT = 52
export const BLACK_KEY_COUNT = 36

const BLACK_NOTE_INDICES = new Set([1, 3, 6, 8, 10])

const BLACK_KEY_OFFSETS: Record<number, number> = {
    1: -0.15,
    3: 0.15,
    6: -0.1,
    8: 0,
    10: 0.1,
}

export interface KeyMetrics {
    pitch: number
    isBlack: boolean
    x: number
    width: number
}

export interface PianoMetrics {
    keys: Map<number, KeyMetrics>
    containerWidth: number
    whiteKeyWidth: number
    blackKeyWidth: number
}

export function isBlackKey(pitch: number): boolean {
    return BLACK_NOTE_INDICES.has(pitch % 12)
}

function countWhiteKeysBefore(pitch: number): number {
    let count = 0
    for (let p = MIDI_MIN; p < pitch; p++) {
        if (!isBlackKey(p)) count++
    }
    return count
}

export function calculatePianoMetricsFromDOM(
    pianoContainerEl: HTMLElement
): PianoMetrics | null {
    const containerRect = pianoContainerEl.getBoundingClientRect()
    if (containerRect.width === 0) return null

    const keys = new Map<number, KeyMetrics>()
    let whiteKeyWidth = 0
    let blackKeyWidth = 0

    for (let pitch = MIDI_MIN; pitch <= MIDI_MAX; pitch++) {
        const el = document.getElementById(`key-${pitch}`)
        if (!el) continue

        const rect = el.getBoundingClientRect()
        const x = rect.left - containerRect.left
        const width = rect.width
        const black = isBlackKey(pitch)

        if (!black && whiteKeyWidth === 0) whiteKeyWidth = width
        if (black && blackKeyWidth === 0) blackKeyWidth = width

        keys.set(pitch, { pitch, isBlack: black, x, width })
    }

    return {
        keys,
        containerWidth: containerRect.width,
        whiteKeyWidth,
        blackKeyWidth,
    }
}

export function calculatePianoMetrics(containerWidth: number): PianoMetrics {
    const whiteKeyWidth = containerWidth / WHITE_KEY_COUNT
    const blackKeyWidth = whiteKeyWidth * 0.6
    const keys = new Map<number, KeyMetrics>()

    let whiteIndex = 0

    for (let pitch = MIDI_MIN; pitch <= MIDI_MAX; pitch++) {
        const black = isBlackKey(pitch)

        if (black) {
            const noteInOctave = pitch % 12
            const offset = BLACK_KEY_OFFSETS[noteInOctave] ?? 0
            const baseX = (whiteIndex) * whiteKeyWidth
            const x = baseX - (blackKeyWidth / 2) + (offset * whiteKeyWidth)

            keys.set(pitch, { pitch, isBlack: true, x, width: blackKeyWidth })
        } else {
            const x = whiteIndex * whiteKeyWidth
            keys.set(pitch, { pitch, isBlack: false, x, width: whiteKeyWidth })
            whiteIndex++
        }
    }

    return {
        keys,
        containerWidth,
        whiteKeyWidth,
        blackKeyWidth,
    }
}

export function getNoteX(
    pitch: number,
    metrics: PianoMetrics
): { x: number; width: number } | null {
    const key = metrics.keys.get(pitch)
    if (!key) return null
    return { x: key.x, width: key.width }
}
