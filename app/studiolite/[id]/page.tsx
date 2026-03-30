'use client'

import * as React from 'react'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useAppStore } from '@/lib/store'
import { getPlaybackManager } from '@/lib/engine/PlaybackManager'
import { parseMidiFile } from '@/lib/midi/parser'
import { fetchConfigById } from '@/app/actions/config'
import { useMusicFont } from '@/hooks/useMusicFont'
import type { SongConfig, ParsedMidi, XMLEvent } from '@/lib/types'
import dynamic from 'next/dynamic'

// Dynamically import ScrollView to avoid SSR issues with DOM APIs
const ScrollView = dynamic(() => import('@/components/score/ScrollView'), { ssr: false })

export default function StudioLite() {
    const params = useParams()
    const configId = params?.id as string

    const [config, setConfig] = useState<SongConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [parsedMidi, setParsedMidi] = useState<ParsedMidi | null>(null)
    const xmlEventsRef = useRef<XMLEvent[]>([])

    const { musicFont, setFont } = useMusicFont()

    const anchors = useAppStore((s) => s.anchors)
    const beatAnchors = useAppStore((s) => s.beatAnchors)
    const setAnchors = useAppStore((s) => s.setAnchors)
    const setBeatAnchors = useAppStore((s) => s.setBeatAnchors)
    const setIsLevel2Mode = useAppStore((s) => s.setIsLevel2Mode)
    const setSubdivision = useAppStore((s) => s.setSubdivision)
    const isPlaying = useAppStore((s) => s.isPlaying)
    const darkMode = useAppStore((s) => s.darkMode)
    const revealMode = useAppStore((s) => s.revealMode)
    const highlightNote = useAppStore((s) => s.highlightNote)
    const glowEffect = useAppStore((s) => s.glowEffect)
    const popEffect = useAppStore((s) => s.popEffect)
    const jumpEffect = useAppStore((s) => s.jumpEffect)
    const isLocked = useAppStore((s) => s.isLocked)
    const cursorPosition = useAppStore((s) => s.cursorPosition)
    const curtainLookahead = useAppStore((s) => s.curtainLookahead)
    const showCursor = useAppStore((s) => s.showCursor)
    const duration = useAppStore((s) => s.duration)
    const loadMidi = useAppStore((s) => s.loadMidi)

    // ── Load config + hydrate store ───────────────────────────────
    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchConfigById(configId)
                if (data) {
                    setConfig(data)
                    if (data.anchors) setAnchors(data.anchors)
                    if (data.beat_anchors) setBeatAnchors(data.beat_anchors)
                    if (data.is_level2) setIsLevel2Mode(data.is_level2)
                    if (data.subdivision) setSubdivision(data.subdivision)
                    if (data.music_font) setFont(data.music_font)
                }
            } catch (err) {
                console.error('[StudioLite] Failed to load config:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [configId, setAnchors, setBeatAnchors, setIsLevel2Mode, setSubdivision, setFont])

    // ── Load MIDI ─────────────────────────────────────────────────
    useEffect(() => {
        if (!config?.midi_url) return
        const load = async () => {
            try {
                const res = await fetch(config.midi_url!)
                const buf = await res.arrayBuffer()
                const parsed = parseMidiFile(buf)
                setParsedMidi(parsed)
                loadMidi(parsed)
                getPlaybackManager().duration = parsed.durationSec
            } catch (err) {
                console.error('[StudioLite] Failed to load MIDI:', err)
            }
        }
        load()
    }, [config?.midi_url, loadMidi])

    // ── Loading state ──────────────────────────────────────────────
    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!config?.xml_url) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <p className="text-zinc-400 text-sm">No score found for this song.</p>
            </div>
        )
    }

    // ── Render: sheet music only, no UI chrome ─────────────────────
    return (
        <div
            className="h-screen w-screen overflow-hidden"
            style={{ backgroundColor: darkMode ? '#18181b' : '#ffffff' }}
        >
            <ScrollView
                xmlUrl={config.xml_url}
                anchors={anchors}
                beatAnchors={beatAnchors}
                isPlaying={isPlaying}
                isAdmin={false}
                darkMode={darkMode}
                revealMode={revealMode}
                highlightNote={highlightNote}
                glowEffect={glowEffect}
                popEffect={popEffect}
                jumpEffect={jumpEffect}
                isLocked={isLocked}
                cursorPosition={cursorPosition}
                curtainLookahead={curtainLookahead}
                showCursor={showCursor}
                duration={duration}
                musicFont={musicFont}
            />
        </div>
    )
}
