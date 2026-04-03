import { Midi } from '@tonejs/midi'
import type { NoteEvent, ParsedMidi } from '../types'

/**
 * Parse a binary MIDI file buffer into a normalized, sorted NoteEvent array.
 */
export function parseMidiFile(buffer: ArrayBuffer, fileName?: string): ParsedMidi {
    if (!buffer || buffer.byteLength === 0) {
        throw new Error('MIDI file is empty')
    }

    // Validate MIDI header magic bytes ("MThd")
    const header = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength))
    if (header[0] !== 0x4D || header[1] !== 0x54 || header[2] !== 0x68 || header[3] !== 0x64) {
        throw new Error('Invalid MIDI file: missing MThd header. The file may be corrupted or not a valid MIDI file.')
    }

    let midi: Midi
    try {
        midi = new Midi(buffer)
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        throw new Error(`Failed to parse MIDI file: ${msg}`)
    }

    if (midi.tracks.length === 0) {
        throw new Error('MIDI file contains no tracks')
    }

    const tempoChanges = midi.header.tempos.map((t) => ({
        time: t.time ?? 0,
        bpm: t.bpm,
    }))

    const notes: NoteEvent[] = []
    let noteIdCounter = 0

    midi.tracks.forEach((track, trackIndex) => {
        track.notes.forEach((note) => {
            const startTimeSec = note.time
            const durationSec = note.duration
            const endTimeSec = startTimeSec + durationSec

            notes.push({
                id: `n-${noteIdCounter++}`,
                pitch: note.midi,
                startTimeSec,
                endTimeSec,
                durationSec,
                velocity: Math.round(note.velocity * 127),
                trackId: trackIndex,
            })
        })
    })

    notes.sort((a, b) => a.startTimeSec - b.startTimeSec)

    const durationSec =
        notes.length > 0
            ? Math.max(...notes.map((n) => n.endTimeSec))
            : 0

    const name = fileName
        ? fileName.replace(/\.(mid|midi)$/i, '').replace(/[_-]/g, ' ')
        : midi.name || 'Untitled'

    return {
        name,
        durationSec,
        notes,
        trackCount: midi.tracks.length,
        tempoChanges,
    }
}

/**
 * Binary search to find the index of the first note that starts at or after `time`.
 */
export function findFirstNoteIndex(notes: NoteEvent[], time: number): number {
    let lo = 0
    let hi = notes.length

    while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (notes[mid].startTimeSec < time) {
            lo = mid + 1
        } else {
            hi = mid
        }
    }

    return lo
}

/**
 * Get the visible slice of notes for the current playback time.
 */
export function getVisibleNotes(
    notes: NoteEvent[],
    currentTime: number,
    lookaheadSec: number
): NoteEvent[] {
    if (notes.length === 0) return []

    const windowStart = currentTime
    const windowEnd = currentTime + lookaheadSec

    let startIdx = findFirstNoteIndex(notes, windowStart)

    while (startIdx > 0 && notes[startIdx - 1].endTimeSec > windowStart) {
        startIdx--
    }

    const visible: NoteEvent[] = []
    for (let i = startIdx; i < notes.length; i++) {
        const note = notes[i]
        if (note.startTimeSec > windowEnd) break
        if (note.endTimeSec > windowStart) {
            visible.push(note)
        }
    }

    return visible
}
