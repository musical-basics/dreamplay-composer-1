/**
 * Waterfall Math — Y-axis positioning for falling notes
 */

import type { NoteEvent } from '../types'

export interface WaterfallConfig {
    strikeLineY: number
    pixelsPerSecond: number
    canvasHeight: number
}

export interface NoteRect {
    y: number
    height: number
}

export function getNoteRect(
    note: NoteEvent,
    logicalTime: number,
    config: WaterfallConfig
): NoteRect {
    const { strikeLineY, pixelsPerSecond } = config
    const timeUntilStart = note.startTimeSec - logicalTime
    const y = strikeLineY - (timeUntilStart * pixelsPerSecond)
    const height = note.durationSec * pixelsPerSecond

    return {
        y: y - height,
        height,
    }
}

export function isNoteActive(note: NoteEvent, logicalTime: number): boolean {
    return logicalTime >= note.startTimeSec && logicalTime <= note.endTimeSec
}

export function isNoteVisible(rect: NoteRect, canvasHeight: number): boolean {
    return (rect.y + rect.height) > 0 && rect.y < canvasHeight
}

export function getLookaheadSeconds(config: WaterfallConfig): number {
    return config.canvasHeight / config.pixelsPerSecond
}
