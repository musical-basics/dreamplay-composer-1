'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Save, ArrowLeft, Music, FileMusic, FileAudio, SkipBack, Play, Pause, Square, FolderOpen, ChevronLeft, ChevronRight, Settings, Activity, Piano } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { SplitScreenLayout } from '@/components/layout/SplitScreenLayout'
import { AnchorSidebar } from '@/components/score/AnchorSidebar'
import { WaveformTimeline } from '@/components/score/WaveformTimeline'
import { MidiTimeline } from '@/components/score/MidiTimeline'
import { ScoreControls } from '@/components/score/ScoreControls'
import { useAppStore } from '@/lib/store'
import { UploadWizard } from '@/components/studio/UploadWizard'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu'
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { useMusicFont } from '@/hooks/useMusicFont'
import { getPlaybackManager } from '@/lib/engine/PlaybackManager'
import { parseMidiFile } from '@/lib/midi/parser'
import type { SongConfig, ParsedMidi, BeatAnchor, XMLEvent, V5MapperState } from '@/lib/types'
import { fetchConfigById, updateConfigAction, generateUploadUrlAction } from '@/app/actions/config'
import { getAudioOffset } from '@/lib/engine/AudioHelpers'

export default function AdminEditor() {
    const params = useParams()
    const router = useRouter()
    const configId = params?.id as string

    const [config, setConfig] = useState<SongConfig | null>(null)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [parsedMidi, setParsedMidi] = useState<ParsedMidi | null>(null)
    const [title, setTitle] = useState('')
    const [isRecording, setIsRecording] = useState(false)
    const [isAiMapping, setIsAiMapping] = useState(false)
    const [midiError, setMidiError] = useState<string | null>(null)
    const [nextMeasure, setNextMeasure] = useState(2)
    const [totalMeasures, setTotalMeasures] = useState(0)
    const [noteCounts, setNoteCounts] = useState<Map<number, number>>(new Map())
    const [xmlEvents, setXmlEvents] = useState<XMLEvent[]>([])
    const xmlEventsRef = useRef<XMLEvent[]>([]) // Persists fermata data across OSMD re-renders
    const [v5State, setV5State] = useState<V5MapperState | null>(null)
    const hasAutoMappedRef = useRef(false)
    const { musicFont, savedFont, setFont } = useMusicFont()
    const [displayTime, setDisplayTime] = useState(0)
    const displayRafRef = useRef<number>(0)
    const [showAdvanced, setShowAdvanced] = useState(false)

    const anchors = useAppStore((s) => s.anchors)
    const beatAnchors = useAppStore((s) => s.beatAnchors)
    const setAnchors = useAppStore((s) => s.setAnchors)
    const setBeatAnchors = useAppStore((s) => s.setBeatAnchors)
    const isPlaying = useAppStore((s) => s.isPlaying)
    const setPlaying = useAppStore((s) => s.setPlaying)
    const darkMode = useAppStore((s) => s.darkMode)
    const setDarkMode = useAppStore((s) => s.setDarkMode)
    const revealMode = useAppStore((s) => s.revealMode)
    const setRevealMode = useAppStore((s) => s.setRevealMode)
    const highlightNote = useAppStore((s) => s.highlightNote)
    const setHighlightNote = useAppStore((s) => s.setHighlightNote)
    const glowEffect = useAppStore((s) => s.glowEffect)
    const setGlowEffect = useAppStore((s) => s.setGlowEffect)
    const popEffect = useAppStore((s) => s.popEffect)
    const setPopEffect = useAppStore((s) => s.setPopEffect)
    const jumpEffect = useAppStore((s) => s.jumpEffect)
    const setJumpEffect = useAppStore((s) => s.setJumpEffect)
    const isLocked = useAppStore((s) => s.isLocked)
    const setIsLocked = useAppStore((s) => s.setIsLocked)
    const showCursor = useAppStore((s) => s.showCursor)
    const setShowCursor = useAppStore((s) => s.setShowCursor)
    const isLevel2Mode = useAppStore((s) => s.isLevel2Mode)
    const setIsLevel2Mode = useAppStore((s) => s.setIsLevel2Mode)
    const subdivision = useAppStore((s) => s.subdivision)
    const setSubdivision = useAppStore((s) => s.setSubdivision)
    const currentMeasure = useAppStore((s) => s.currentMeasure)
    const duration = useAppStore((s) => s.duration)
    const loadMidi = useAppStore((s) => s.loadMidi)
    const showMidiTimeline = useAppStore((s) => s.showMidiTimeline)
    const setShowMidiTimeline = useAppStore((s) => s.setShowMidiTimeline)
    const showWaveformTimeline = useAppStore((s) => s.showWaveformTimeline)
    const setShowWaveformTimeline = useAppStore((s) => s.setShowWaveformTimeline)
    const showAnchorSidebar = useAppStore((s) => s.showAnchorSidebar)
    const setShowAnchorSidebar = useAppStore((s) => s.setShowAnchorSidebar)
    const showWaterfall = useAppStore((s) => s.showWaterfall)
    const setShowWaterfall = useAppStore((s) => s.setShowWaterfall)

    const audioInputRef = useRef<HTMLInputElement>(null)
    const xmlInputRef = useRef<HTMLInputElement>(null)
    const midiInputRef = useRef<HTMLInputElement>(null)



    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchConfigById(configId)
                if (data) {
                    setConfig(data)
                    setTitle(data.title)
                    if (data.anchors) setAnchors(data.anchors)
                    if (data.beat_anchors) setBeatAnchors(data.beat_anchors)
                    if (data.is_level2) setIsLevel2Mode(data.is_level2)
                    if (data.subdivision) setSubdivision(data.subdivision)
                    console.log('[FONT DEBUG] DB returned music_font:', JSON.stringify(data.music_font), 'type:', typeof data.music_font)
                    if (data.music_font) {
                        setFont(data.music_font)
                    }
                }
            } catch (err) {
                console.error('Failed to load config:', err)
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [configId, setAnchors, setBeatAnchors, setIsLevel2Mode, setSubdivision])

    useEffect(() => {
        if (!config?.midi_url) return
        setMidiError(null)
        const loadMidiFromUrl = async () => {
            try {
                const response = await fetch(config.midi_url!)
                if (!response.ok) {
                    throw new Error(`Failed to fetch MIDI file: ${response.status} ${response.statusText}`)
                }
                const buffer = await response.arrayBuffer()
                const parsed = parseMidiFile(buffer)
                setParsedMidi(parsed)
                loadMidi(parsed)
                getPlaybackManager().duration = parsed.durationSec
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to load MIDI'
                setMidiError(msg)
                console.error('Failed to load MIDI:', err)
            }
        }
        loadMidiFromUrl()
    }, [config?.midi_url, loadMidi])

    const handleSave = async () => {
        try {
            setSaving(true)
            console.log('[FONT DEBUG] Saving music_font:', JSON.stringify(savedFont), '(musicFont state:', JSON.stringify(musicFont), ')')
            await updateConfigAction(configId, {
                title, anchors, beat_anchors: beatAnchors,
                subdivision, is_level2: isLevel2Mode,
                music_font: savedFont,
            })
        } catch (err) { console.error('Failed to save:', err) }
        finally { setSaving(false) }
    }

    const handleSaveAs = async () => {
        const newTitle = prompt('Enter a name for the copy:', `${title} (Copy)`)
        if (!newTitle) return
        try {
            setSaving(true)
            await updateConfigAction(configId, {
                title, anchors, beat_anchors: beatAnchors,
                subdivision, is_level2: isLevel2Mode,
            })
            const { duplicateConfigAction } = await import('@/app/actions/config')
            const newConfig = await duplicateConfigAction(configId, newTitle)
            router.push(`/studio/edit/${newConfig.id}`)
        } catch (err) { console.error('Save As failed:', err) }
        finally { setSaving(false) }
    }

    const handleAudioUpload = async (fileOrEvent: File | React.ChangeEvent<HTMLInputElement>) => {
        const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent.target.files?.[0]
        if (!file) return
        try {
            const contentType = file.type || 'audio/wav'
            const { uploadUrl, finalFileUrl } = await generateUploadUrlAction(configId, 'audio', file.name, contentType)
            const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })
            if (!res.ok) throw new Error('Failed to upload file to R2')
            await updateConfigAction(configId, { audio_url: finalFileUrl })
            setConfig((prev) => prev ? { ...prev, audio_url: finalFileUrl } : prev)

            // Hotload: create audio element immediately so playback is ready
            const audio = new Audio(finalFileUrl)
            audio.crossOrigin = 'anonymous'
            const pm = getPlaybackManager()
            pm.setAudioElement(audio)
            audio.addEventListener('loadedmetadata', () => { pm.duration = audio.duration })
        } catch (err) { console.error(err) }
        if (!(fileOrEvent instanceof File)) fileOrEvent.target.value = ''
    }

    const handleXmlUpload = async (fileOrEvent: File | React.ChangeEvent<HTMLInputElement>) => {
        const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent.target.files?.[0]
        if (!file) return
        try {
            const contentType = file.type || 'application/xml'
            const { uploadUrl, finalFileUrl } = await generateUploadUrlAction(configId, 'xml', file.name, contentType)
            const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })
            if (!res.ok) throw new Error('Failed to upload file to R2')
            await updateConfigAction(configId, { xml_url: finalFileUrl })
            setConfig((prev) => prev ? { ...prev, xml_url: finalFileUrl } : prev)
        } catch (err) { console.error(err) }
        if (!(fileOrEvent instanceof File)) fileOrEvent.target.value = ''
    }

    const handleMidiUpload = async (fileOrEvent: File | React.ChangeEvent<HTMLInputElement>) => {
        const file = fileOrEvent instanceof File ? fileOrEvent : fileOrEvent.target.files?.[0]
        if (!file) return
        try {
            const contentType = file.type || 'audio/midi'
            const { uploadUrl, finalFileUrl } = await generateUploadUrlAction(configId, 'midi', file.name, contentType)
            const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })
            if (!res.ok) throw new Error('Failed to upload file to R2')
            await updateConfigAction(configId, { midi_url: finalFileUrl })
            setConfig((prev) => prev ? { ...prev, midi_url: finalFileUrl } : prev)

            const buffer = await file.arrayBuffer()
            const parsed = parseMidiFile(buffer, file.name)
            setParsedMidi(parsed); loadMidi(parsed)
            getPlaybackManager().duration = parsed.durationSec
        } catch (err) { console.error(err) }
        if (!(fileOrEvent instanceof File)) fileOrEvent.target.value = ''
    }

    const handleSetAnchor = useCallback((measure: number, time: number) => {
        setAnchors(anchors.map((a) => (a.measure === measure ? { ...a, time } : a)))
    }, [anchors, setAnchors])

    const handleDeleteAnchor = useCallback((measure: number) => {
        if (measure === 1) return
        setAnchors(anchors.filter((a) => a.measure !== measure))
    }, [anchors, setAnchors])

    const handleSetBeatAnchor = useCallback((measure: number, beat: number, time: number) => {
        setBeatAnchors((prev) => {
            const filtered = prev.filter(b => !(b.measure === measure && b.beat === beat))
            const newBeats = [...filtered, { measure, beat, time }]
            return newBeats.sort((a, b) => {
                if (a.measure !== b.measure) return a.measure - b.measure
                return a.beat - b.beat
            })
        })
    }, [setBeatAnchors])


    const handlePlayPause = async () => {
        const pm = getPlaybackManager()
        if (isPlaying) { pm.pause(); setPlaying(false) }
        else { await pm.play(); setPlaying(true) }
    }

    const handleStop = useCallback(() => {
        const pm = getPlaybackManager()
        pm.pause()
        pm.seek(0)
        setPlaying(false)
        setDisplayTime(0)
    }, [setPlaying])

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60)
        const sec = Math.floor(s % 60)
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
    }

    // rAF loop to poll current playback time for the transport slider
    useEffect(() => {
        const tick = () => {
            setDisplayTime(getPlaybackManager().getTime())
            displayRafRef.current = requestAnimationFrame(tick)
        }
        displayRafRef.current = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(displayRafRef.current)
    }, [])

    const handleSeek = useCallback((time: number) => {
        getPlaybackManager().seek(time)
    }, [])

    const toggleRecordMode = () => {
        if (!isRecording) {
            const maxMeasure = anchors.length > 0 ? Math.max(...anchors.map((a) => a.measure)) : 1
            setNextMeasure(maxMeasure + 1)
        }
        setIsRecording(!isRecording)
    }

    const handleTap = useCallback(() => {
        if (!isRecording) return
        const time = getPlaybackManager().getTime()
        const measure = nextMeasure

        const existing = anchors.find(a => a.measure === measure)
        if (existing) {
            setAnchors(anchors.map(a => a.measure === measure ? { ...a, time } : a))
        } else {
            setAnchors([...anchors, { measure, time }].sort((a, b) => a.measure - b.measure))
        }
        setNextMeasure(measure + 1)
    }, [isRecording, nextMeasure, anchors, setAnchors])

    const handleClearAll = useCallback(() => {
        if (confirm("Are you sure you want to clear all mappings?")) {
            setAnchors([{ measure: 1, time: 0 }])
            setBeatAnchors([])
            setNextMeasure(2)
        }
    }, [setAnchors, setBeatAnchors])

    const handleScoreLoaded = useCallback((total: number, counts: Map<number, number>, events?: XMLEvent[]) => {
        setTotalMeasures(total)
        setNoteCounts(counts)
        // Persist xmlEvents in ref on FIRST load — ref survives OSMD re-renders
        if (events && events.length > 0 && xmlEventsRef.current.length === 0) {
            xmlEventsRef.current = events
            setXmlEvents(events)
            const fermataCount = events.filter(e => e.hasFermata).length
            console.log(`[EditPage] Locked ${events.length} xmlEvents into ref (${fermataCount} fermatas)`)
        }
    }, [])

    const handleAutoMap = useCallback(async (chordThresholdFraction: number) => {
        if (!parsedMidi) { alert('Please load a MIDI file first.'); return; }
        if (totalMeasures === 0 || xmlEventsRef.current.length === 0) { alert('Please wait for score to process.'); return; }

        setIsAiMapping(true);
        try {
            const { initV5, stepV5 } = await import('@/lib/engine/AutoMapperV5');

            // Detect audio peak for initial offset (optional but helpful)
            let audioOffset = 0;
            try {
                audioOffset = await getAudioOffset(config?.audio_url || null);
            } catch (e) {
                console.warn('[AutoMap] Audio peak detection failed, using 0s offset');
            }

            let state = initV5(parsedMidi.notes, xmlEventsRef.current, audioOffset, chordThresholdFraction);

            // Auto-run steps until paused or done
            while (state.status === 'running') {
                state = stepV5(state, parsedMidi.notes, xmlEventsRef.current);
            }

            setV5State(state);

            if (state.status === 'done') {
                setAnchors(state.anchors);
                setBeatAnchors(state.beatAnchors);
                setIsLevel2Mode(true);
            } else if (state.status === 'paused') {
                // Apply partial results so user sees progress on the score
                setAnchors(state.anchors);
                setBeatAnchors(state.beatAnchors);
                setIsLevel2Mode(true);
            }
        } catch (err) {
            console.error('[AutoMap Error]', err);
            alert('Auto-mapping failed (check console).');
        } finally {
            setIsAiMapping(false);
        }
    }, [parsedMidi, totalMeasures, config?.audio_url, setAnchors, setBeatAnchors, setIsLevel2Mode]);

    // Auto-run Echolocation V5 once all data is ready and anchors haven't been mapped
    useEffect(() => {
        if (hasAutoMappedRef.current) return
        if (!parsedMidi || totalMeasures === 0 || xmlEvents.length === 0) return
        // Only auto-run if anchors are still at the default (just M1)
        if (anchors.length > 1) return

        hasAutoMappedRef.current = true
        console.log('[EditPage] Auto-running Echolocation V5...')
        handleAutoMap(0.0625) // 64th note chord threshold (default)
    }, [parsedMidi, totalMeasures, xmlEvents, anchors.length, handleAutoMap])

    const handleConfirmGhost = useCallback(async () => {
        if (!v5State || v5State.status !== 'paused' || !v5State.ghostAnchor || !parsedMidi) return;

        const { confirmGhost, stepV5 } = await import('@/lib/engine/AutoMapperV5');
        let state = confirmGhost(v5State, v5State.ghostAnchor.time);

        // Continue stepping after confirm
        while (state.status === 'running') {
            state = stepV5(state, parsedMidi.notes, xmlEventsRef.current);
        }

        setV5State(state);
        setAnchors(state.anchors);
        setBeatAnchors(state.beatAnchors);
    }, [v5State, parsedMidi, setAnchors, setBeatAnchors]);

    const handleProceedMapping = useCallback(async () => {
        // Same as confirm — confirm at current ghost time, then continue
        await handleConfirmGhost();
    }, [handleConfirmGhost]);

    const handleRunV5ToEnd = useCallback(async () => {
        if (!v5State || !parsedMidi) return;

        const { runV5ToEnd } = await import('@/lib/engine/AutoMapperV5');
        const finalState = runV5ToEnd(v5State, parsedMidi.notes, xmlEventsRef.current);

        setV5State(finalState);
        setAnchors(finalState.anchors);
        setBeatAnchors(finalState.beatAnchors);
        setIsLevel2Mode(true);
    }, [v5State, parsedMidi, setAnchors, setBeatAnchors, setIsLevel2Mode]);

    const handleUpdateGhostTime = useCallback((time: number) => {
        if (!v5State || !v5State.ghostAnchor) return;
        setV5State({
            ...v5State,
            ghostAnchor: { ...v5State.ghostAnchor, time },
        });
    }, [v5State]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

            if (e.code === 'Space') { e.preventDefault(); handlePlayPause() }
            if (e.code === 'KeyA' && isRecording && isPlaying) {
                e.preventDefault()
                handleTap()
            }
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [isPlaying, isRecording, handlePlayPause, handleTap])


    if (loading) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    if (!config?.audio_url || !config?.xml_url || !config?.midi_url) {
        return (
            <div className="min-h-screen bg-zinc-950 flex flex-col">
                <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="sm" onClick={() => router.push('/studio')} className="text-zinc-400 hover:text-white">
                            <ArrowLeft className="w-4 h-4 mr-1" /> Back
                        </Button>
                        <span className="text-white text-lg font-medium">{title || 'Untitled Song'}</span>
                    </div>
                </div>
                <div className="flex-1 overflow-auto">
                    {config && (
                        <UploadWizard
                            config={config}
                            onUploadAudio={handleAudioUpload}
                            onUploadXml={handleXmlUpload}
                            onUploadMidi={handleMidiUpload}
                        />
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="h-screen flex overflow-hidden bg-zinc-950">
            <input ref={audioInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
            <input ref={xmlInputRef} type="file" accept=".xml,.musicxml,.mxl" className="hidden" onChange={handleXmlUpload} />
            <input ref={midiInputRef} type="file" accept=".mid,.midi" className="hidden" onChange={handleMidiUpload} />

            {showAnchorSidebar && (
                <AnchorSidebar
                    anchors={anchors}
                    beatAnchors={beatAnchors}
                    currentMeasure={currentMeasure}
                    totalMeasures={totalMeasures || 100}
                    isLevel2Mode={isLevel2Mode}
                    darkMode={darkMode}
                    onSetAnchor={handleSetAnchor}
                    onDeleteAnchor={handleDeleteAnchor}
                    onSetBeatAnchor={handleSetBeatAnchor}
                    onToggleLevel2={setIsLevel2Mode}
                    onTap={handleTap}
                    onClearAll={handleClearAll}
                    onAutoMap={handleAutoMap}
                    onConfirmGhost={handleConfirmGhost}
                    onProceedMapping={handleProceedMapping}
                    onRunV5ToEnd={handleRunV5ToEnd}
                    onUpdateGhostTime={handleUpdateGhostTime}
                    v5State={v5State}
                    isAiMapping={isAiMapping}
                />
            )}

            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex flex-col bg-zinc-900 border-b border-zinc-800 shrink-0">
                    {/* Row 1: Navigation, Title, Files, Transport, Record */}
                    <div className="flex items-center justify-between px-4 py-2">
                        <div className="flex items-center gap-3">
                            <Button variant="ghost" size="sm" onClick={() => router.push('/studio')} className="text-zinc-400 hover:text-white">
                                <ArrowLeft className="w-4 h-4 mr-1" /> Back
                            </Button>
                            <input
                                type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                                placeholder="Song title..."
                                className="bg-transparent border-none text-white text-lg font-medium focus:outline-none placeholder:text-zinc-600 w-64"
                            />
                            <Button size="sm" onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-700 text-white">
                                <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={handleSaveAs} disabled={saving} className="border-zinc-600 text-zinc-300 hover:text-white">
                                Save As
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => router.push('/studio')} className="text-zinc-400 hover:text-white">
                                <FolderOpen className="w-3.5 h-3.5 mr-1" /> Open
                            </Button>
                        </div>

                        <div className="flex items-center gap-2">
                            {/* View Quick Toggles */}
                            <div className="flex items-center gap-1 bg-zinc-950/50 rounded-lg p-0.5 border border-zinc-800 mr-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowWaveformTimeline(!showWaveformTimeline)}
                                    className={`h-7 px-2 flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-wider transition-all ${showWaveformTimeline ? 'text-purple-400 bg-purple-500/10 shadow-[inset_0_0_10px_rgba(168,85,247,0.1)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    title="Toggle Audio Waveform"
                                >
                                    <Activity className="w-3 h-3" />
                                    <span>Waveform</span>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setShowWaterfall(!showWaterfall)}
                                    className={`h-7 px-2 flex items-center gap-1.5 text-[9px] uppercase font-bold tracking-wider transition-all ${showWaterfall ? 'text-amber-400 bg-amber-500/10 shadow-[inset_0_0_10px_rgba(245,158,11,0.1)]' : 'text-zinc-500 hover:text-zinc-300'}`}
                                    title="Toggle Falling Keys Mode"
                                >
                                    <Piano className="w-3 h-3" />
                                    <span>Falling Keys</span>
                                </Button>
                            </div>

                            {/* Manage Files Dropdown */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:text-white h-8">
                                        <FolderOpen className="w-3.5 h-3.5 mr-1" /> Files
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800 text-zinc-300">
                                    <DropdownMenuLabel>Source Files</DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-zinc-800" />
                                    <DropdownMenuItem onClick={() => audioInputRef.current?.click()} className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <FileAudio className="w-4 h-4 mr-2 text-purple-400" /> Audio (WAV)
                                        </div>
                                        {config?.audio_url && <div className="w-2 h-2 rounded-full bg-green-500" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => xmlInputRef.current?.click()} className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <FileMusic className="w-4 h-4 mr-2 text-blue-400" /> Score (XML)
                                        </div>
                                        {config?.xml_url && <div className="w-2 h-2 rounded-full bg-green-500" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => midiInputRef.current?.click()} className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <Music className="w-4 h-4 mr-2 text-amber-400" /> Performance (MIDI)
                                        </div>
                                        {config?.midi_url && <div className="w-2 h-2 rounded-full bg-green-500" />}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator className="bg-zinc-800" />
                                    <DropdownMenuItem onClick={() => router.push('/studio')} className="text-zinc-400">
                                        Back to Dashboard
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            {/* View Dropdown */}
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:text-white h-8">
                                        Settings
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 bg-zinc-900 border-zinc-800 text-zinc-300">
                                    <DropdownMenuLabel>Interface Views</DropdownMenuLabel>
                                    <DropdownMenuSeparator className="bg-zinc-800" />
                                    <DropdownMenuCheckboxItem checked={showAnchorSidebar} onCheckedChange={setShowAnchorSidebar}>
                                        Anchor Sidebar
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={showMidiTimeline} onCheckedChange={setShowMidiTimeline}>
                                        MIDI Piano Roll
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={showWaveformTimeline} onCheckedChange={setShowWaveformTimeline}>
                                        Audio Waveform
                                    </DropdownMenuCheckboxItem>
                                    <DropdownMenuCheckboxItem checked={showWaterfall} onCheckedChange={setShowWaterfall}>
                                        Falling Keys Mode
                                    </DropdownMenuCheckboxItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Button
                                variant="outline"
                                size="sm"
                                className="border-zinc-700 text-zinc-400 hover:text-white h-8"
                                onClick={() => router.push(`/studio/audit/${configId}`)}
                            >
                                Score Audit
                            </Button>

                            <div className="w-px h-6 bg-zinc-700 mx-1" />

                            {/* Transport */}
                            <span className="font-mono text-xs text-zinc-400 w-12 text-right tabular-nums">
                                {formatTime(displayTime)}
                            </span>
                            <div className="w-36">
                                <Slider
                                    value={[displayTime]}
                                    min={0}
                                    max={duration || 100}
                                    step={0.1}
                                    onValueChange={(v) => handleSeek(v[0])}
                                    className="[&_[data-slot=slider-track]]:bg-zinc-700 [&_[data-slot=slider-range]]:bg-purple-500"
                                />
                            </div>
                            <span className="font-mono text-xs text-zinc-400 w-12 tabular-nums">
                                {formatTime(duration)}
                            </span>

                            <Button variant="ghost" size="sm" onClick={() => handleSeek(Math.max(0, displayTime - 5))} className="text-zinc-400 h-8 px-1" title="Skip back 5s">
                                <SkipBack className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleSeek(Math.max(0, displayTime - 0.05))} className="text-zinc-400 h-8 px-1" title="Back 1 frame">
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="sm" onClick={handlePlayPause} className="bg-purple-600 hover:bg-purple-700 text-white rounded-full w-8 h-8 p-0">
                                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleSeek(Math.min(duration, displayTime + 0.05))} className="text-zinc-400 h-8 px-1" title="Forward 1 frame">
                                <ChevronRight className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={handleStop} className="text-zinc-400 h-8 px-1">
                                <Square className="w-3.5 h-3.5" />
                            </Button>

                            <div className="w-px h-6 bg-zinc-700 mx-1" />

                            <Button size="sm" onClick={toggleRecordMode} className={`text-white min-w-[100px] ${isRecording ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-zinc-700 hover:bg-zinc-600'}`}>
                                ⏺ {isRecording ? `Rec (M${nextMeasure})` : 'Record'}
                            </Button>
                        </div>
                    </div>

                    {/* Row 2: Advanced Settings (Collapsible) */}
                    <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                        <div className="flex items-center justify-start px-4 h-8 border-t border-zinc-800/50">
                            <CollapsibleTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-zinc-500 hover:text-white h-6 px-1 text-[10px] uppercase tracking-wider font-semibold"
                                >
                                    <Settings className={`w-3 h-3 mr-1.5 transition-transform duration-200 ${showAdvanced ? 'rotate-90' : ''}`} />
                                    {showAdvanced ? 'Hide Advanced Config' : 'Show Advanced Config'}
                                </Button>
                            </CollapsibleTrigger>
                        </div>

                        <CollapsibleContent>
                            <div className="flex items-center gap-6 px-4 py-3 bg-zinc-900/50 border-t border-zinc-800/30">
                                <div className="flex flex-col gap-1.5">
                                    <Label className="text-[10px] text-zinc-500 uppercase font-bold">Score Font</Label>
                                    <select
                                        value={musicFont}
                                        onChange={(e) => setFont(e.target.value)}
                                        className="text-xs px-2 py-1 rounded border bg-zinc-800 border-zinc-700 text-zinc-300 cursor-pointer hover:border-zinc-600 focus:outline-none min-w-[120px]"
                                    >
                                        <option value="Bravura">♪ Bravura</option>
                                        <option value="Gonville">♪ Gonville</option>
                                        <option value="Petaluma">♪ Petaluma</option>
                                        <option value="Academico">♪ Academico</option>
                                    </select>
                                </div>

                                <div className="h-12 w-px bg-zinc-800" />

                                <div className="flex flex-col gap-1.5 flex-1">
                                    <Label className="text-[10px] text-zinc-500 uppercase font-bold">Visual Appearance</Label>
                                    <ScoreControls
                                        revealMode={revealMode} darkMode={darkMode} highlightNote={highlightNote}
                                        glowEffect={glowEffect} popEffect={popEffect} jumpEffect={jumpEffect}
                                        isLocked={isLocked} showCursor={showCursor} isAdmin={true}
                                        onRevealModeChange={setRevealMode} onDarkModeToggle={() => setDarkMode(!darkMode)}
                                        onHighlightToggle={() => setHighlightNote(!highlightNote)} onGlowToggle={() => setGlowEffect(!glowEffect)}
                                        onPopToggle={() => setPopEffect(!popEffect)} onJumpToggle={() => setJumpEffect(!jumpEffect)}
                                        onLockToggle={() => setIsLocked(!isLocked)} onCursorToggle={() => setShowCursor(!showCursor)}
                                    />
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </div>

                <div className="flex-1 overflow-hidden">
                    <SplitScreenLayout
                        audioUrl={config?.audio_url || null}
                        xmlUrl={config?.xml_url || null}
                        parsedMidi={parsedMidi}
                        isAdmin={true}
                        musicFont={musicFont}
                        onUpdateAnchor={handleSetAnchor}
                        onUpdateBeatAnchor={handleSetBeatAnchor}
                        onScoreLoaded={handleScoreLoaded}
                    />
                </div>

                <div className="shrink-0 flex flex-col gap-0.5">
                    {midiError && (
                        <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                            <span className="font-medium">MIDI Error:</span>
                            <span className="truncate">{midiError}</span>
                        </div>
                    )}
                    {showMidiTimeline && (
                        <MidiTimeline
                            parsedMidi={parsedMidi}
                            anchors={anchors}
                            beatAnchors={beatAnchors}
                            ghostAnchor={v5State?.ghostAnchor}
                            isPlaying={isPlaying}
                            duration={duration}
                            onSeek={handleSeek}
                            onAnchorDrag={handleSetAnchor}
                            onBeatAnchorDrag={handleSetBeatAnchor}
                            darkMode={darkMode}
                        />
                    )}
                    {showWaveformTimeline && (
                        <WaveformTimeline
                            audioUrl={config?.audio_url || null}
                            anchors={anchors}
                            beatAnchors={beatAnchors}
                            isPlaying={isPlaying}
                            duration={duration}
                            onSeek={handleSeek}
                            onAnchorDrag={handleSetAnchor}
                            onBeatAnchorDrag={handleSetBeatAnchor}
                            darkMode={darkMode}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
