/**
 * TimeMapper — Maps absolute playback time to measure/beat position
 *
 * Extracted from score-follower's ScrollView for reuse across components.
 * Used by both ScrollView (sheet music cursor) and any future sync consumers.
 */

import type { Anchor, BeatAnchor } from '@/lib/types'

export interface MeasureBeatPosition {
    /** Current measure number (1-indexed) */
    measure: number
    /** Current beat within the measure (1-indexed) */
    beat: number
    /** Progress through the current segment (0..1) */
    progress: number
    /** Whether playback is past the last anchor */
    pastEnd: boolean
}

/**
 * Find the current measure/beat position given absolute time and anchor arrays.
 *
 * Algorithm:
 * 1. Find the two surrounding measure anchors (before and after current time)
 * 2. If beat anchors exist for this measure, interpolate between them
 * 3. Otherwise, linearly interpolate between measure anchors
 */
export function mapTimeToPosition(
    time: number,
    anchors: Anchor[],
    beatAnchors: BeatAnchor[] = []
): MeasureBeatPosition {
    if (anchors.length === 0) {
        return { measure: 1, beat: 1, progress: 0, pastEnd: false }
    }

    // Sort anchors by time
    const sorted = [...anchors].sort((a, b) => a.time - b.time)

    // Before the first anchor
    if (time <= sorted[0].time) {
        return { measure: sorted[0].measure, beat: 1, progress: 0, pastEnd: false }
    }

    // After the last anchor
    if (time >= sorted[sorted.length - 1].time) {
        return {
            measure: sorted[sorted.length - 1].measure,
            beat: 1,
            progress: 1,
            pastEnd: true,
        }
    }

    // Find surrounding anchors
    let lowerIdx = 0
    for (let i = sorted.length - 1; i >= 0; i--) {
        if (sorted[i].time <= time) {
            lowerIdx = i
            break
        }
    }

    const lower = sorted[lowerIdx]
    const upper = sorted[lowerIdx + 1] || lower

    if (lower === upper) {
        return { measure: lower.measure, beat: 1, progress: 0, pastEnd: false }
    }

    // Check for beat anchors in this measure
    if (beatAnchors.length > 0) {
        const measureBeats = beatAnchors
            .filter((b) => b.measure === lower.measure)
            .sort((a, b) => a.time - b.time)

        if (measureBeats.length > 0) {
            // Find surrounding beat anchors
            let beatLowerIdx = 0
            for (let i = measureBeats.length - 1; i >= 0; i--) {
                if (measureBeats[i].time <= time) {
                    beatLowerIdx = i
                    break
                }
            }

            const beatLower = measureBeats[beatLowerIdx]
            const beatUpper = measureBeats[beatLowerIdx + 1] || upper

            const beatDuration = (beatUpper as { time: number }).time - beatLower.time
            const beatProgress = beatDuration > 0
                ? (time - beatLower.time) / beatDuration
                : 0

            return {
                measure: lower.measure,
                beat: beatLower.beat,
                progress: Math.max(0, Math.min(1, beatProgress)),
                pastEnd: false,
            }
        }
    }

    // Linear interpolation between measure anchors
    const duration = upper.time - lower.time
    const progress = duration > 0 ? (time - lower.time) / duration : 0

    return {
        measure: lower.measure,
        beat: 1,
        progress: Math.max(0, Math.min(1, progress)),
        pastEnd: false,
    }
}

/**
 * Inverse: given a measure/beat, find the approximate time.
 */
export function mapPositionToTime(
    measure: number,
    beat: number,
    anchors: Anchor[],
    beatAnchors: BeatAnchor[] = []
): number {
    // Check beat anchors first
    if (beatAnchors.length > 0) {
        const exact = beatAnchors.find((b) => b.measure === measure && b.beat === beat)
        if (exact) return exact.time
    }

    // Fall back to measure anchors
    const exact = anchors.find((a) => a.measure === measure)
    if (exact) return exact.time

    // Interpolate
    const sorted = [...anchors].sort((a, b) => a.measure - b.measure)

    let lower = sorted[0]
    let upper = sorted[sorted.length - 1]

    for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].measure <= measure && sorted[i + 1].measure > measure) {
            lower = sorted[i]
            upper = sorted[i + 1]
            break
        }
    }

    const measureRange = upper.measure - lower.measure
    if (measureRange === 0) return lower.time

    const progress = (measure - lower.measure) / measureRange
    return lower.time + progress * (upper.time - lower.time)
}
