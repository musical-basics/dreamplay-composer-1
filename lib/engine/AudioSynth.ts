/**
 * AudioSynth — Piano Soundfont Playback via smplr
 */

import type { NoteEvent } from '../types'

interface SmplrSoundfont {
    start: (opts: {
        note: number
        velocity?: number
        time?: number
        duration?: number | null
    }) => (() => void)
    stop: (opts?: { stopId?: string | number; time?: number } | string | number) => void
    loaded: () => Promise<unknown>
    output: { setVolume: (vol: number) => void }
    load: Promise<unknown>
    disconnect: () => void
}

export class AudioSynth {
    private soundfont: SmplrSoundfont | null = null
    private audioContext: AudioContext
    private _loaded = false
    private _loading = false
    private _volume = 100

    private masterGain: GainNode
    private scheduledNotes = new Set<string>()

    // When a master WAV is playing, mute the synth (visual-only mode)
    private _masterAudioActive = false

    constructor(audioContext: AudioContext) {
        this.audioContext = audioContext
        this.masterGain = audioContext.createGain()
        this.masterGain.connect(audioContext.destination)
    }

    get loaded(): boolean {
        return this._loaded
    }

    get masterAudioActive(): boolean {
        return this._masterAudioActive
    }

    set masterAudioActive(active: boolean) {
        this._masterAudioActive = active
        if (active) {
            // Mute synth when master WAV is playing (avoid double audio)
            const now = this.audioContext.currentTime
            this.masterGain.gain.cancelScheduledValues(now)
            this.masterGain.gain.setValueAtTime(0, now)
        } else {
            // Restore volume when no master WAV
            const now = this.audioContext.currentTime
            this.masterGain.gain.cancelScheduledValues(now)
            this.masterGain.gain.setValueAtTime(this._volume / 127, now)
        }
    }

    async load(): Promise<void> {
        if (this._loaded || this._loading) return
        this._loading = true

        try {
            console.log('[SynthUI Audio] Loading piano soundfont...')
            const { Soundfont: SoundfontClass } = await import('smplr')

            this.soundfont = new SoundfontClass(this.audioContext, {
                instrument: 'acoustic_grand_piano',
                destination: this.masterGain,
            }) as unknown as SmplrSoundfont

            await this.soundfont.loaded()
            this._loaded = true
            console.log('[SynthUI Audio] ✅ Piano soundfont loaded')
        } catch (err) {
            console.error('[SynthUI Audio] ❌ Failed to load soundfont:', err)
            this._loading = false
            throw err
        }
    }

    playTestNote(pitch: number = 60): void {
        if (!this.soundfont || !this._loaded) return
        this.masterGain.gain.cancelScheduledValues(this.audioContext.currentTime)
        this.masterGain.gain.setValueAtTime(this._volume / 127, this.audioContext.currentTime)
        this.soundfont.start({ note: pitch, velocity: 100, duration: 0.5 })
    }

    scheduleNotes(
        notes: NoteEvent[],
        songStartCtxTime: number,
        songOffset: number,
        playbackRate: number,
        mutedTracks: Set<number>
    ): number {
        if (!this.soundfont || !this._loaded) return 0

        // When master audio is active, still schedule notes for visual events
        // but the gain is muted so no sound is produced
        if (!this._masterAudioActive) {
            this.masterGain.gain.cancelScheduledValues(this.audioContext.currentTime)
            this.masterGain.gain.setValueAtTime(this._volume / 127, this.audioContext.currentTime)
        }

        const ctx = this.audioContext
        let scheduled = 0

        const searchStart = songOffset - 0.1
        let lo = 0
        let hi = notes.length
        while (lo < hi) {
            const mid = (lo + hi) >>> 1
            if (notes[mid].startTimeSec < searchStart) {
                lo = mid + 1
            } else {
                hi = mid
            }
        }

        const maxLookahead = ctx.currentTime + 4
        for (let i = lo; i < notes.length; i++) {
            const note = notes[i]
            const noteStartInSong = note.startTimeSec - songOffset
            const ctxTime = songStartCtxTime + (noteStartInSong / playbackRate)

            if (ctxTime > maxLookahead) break
            if (mutedTracks.has(note.trackId)) continue
            if (this.scheduledNotes.has(note.id)) continue
            if (note.endTimeSec <= songOffset) continue
            if (noteStartInSong < -0.1) continue

            const duration = note.durationSec / playbackRate

            try {
                this.soundfont.start({
                    note: note.pitch,
                    velocity: note.velocity,
                    time: Math.max(ctxTime, ctx.currentTime),
                    duration: Math.max(duration, 0.05),
                })
                scheduled++
                this.scheduledNotes.add(note.id)
            } catch {
                // Ignore
            }
        }

        return scheduled
    }

    stopAll(): void {
        const now = this.audioContext.currentTime
        this.masterGain.gain.cancelScheduledValues(now)
        this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now)
        this.masterGain.gain.linearRampToValueAtTime(0, now + 0.02)

        if (this.soundfont) {
            try {
                this.soundfont.stop()
            } catch {
                // Ignore
            }
        }

        this.scheduledNotes.clear()
    }

    setVolume(v: number): void {
        this._volume = Math.max(0, Math.min(127, v))
        if (!this._masterAudioActive) {
            const now = this.audioContext.currentTime
            this.masterGain.gain.cancelScheduledValues(now)
            this.masterGain.gain.setValueAtTime(this._volume / 127, now)
        }
    }

    destroy(): void {
        this.stopAll()
        if (this.soundfont) {
            try { this.soundfont.disconnect() } catch { /* ignore */ }
        }
        this.soundfont = null
        this.masterGain.disconnect()
        this._loaded = false
        this._loading = false
    }
}
