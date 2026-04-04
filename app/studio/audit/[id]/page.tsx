'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    ArrowLeft, Upload, Loader2, AlertTriangle, CheckCircle, Info, XCircle,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight, SkipForward, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseMusicXml } from '@/lib/score/MusicXmlParser'
import type { IntermediateScore } from '@/lib/score/IntermediateScore'
import { VexFlowRenderer, type VexFlowRenderResult } from '@/components/score/VexFlowRenderer'
import { fetchConfigById } from '@/app/actions/config'
import { runScoreAudit, fetchAvailableModels, saveReferenceImage, loadAllReferenceImages, loadAllRenderCaptures, saveAuditResultMarkdown, type AuditResult } from '@/app/actions/scoreAudit'
import { captureMeasureRender } from '@/app/actions/captureRenders'
import type { SongConfig } from '@/lib/types'

type MeasureStatus = 'pending' | 'auditing' | 'pass' | 'fail' | 'skipped'

const SEVERITY_CONFIG = {
    critical: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 border-red-200', label: 'Critical' },
    major: { icon: AlertTriangle, color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', label: 'Major' },
    minor: { icon: Info, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', label: 'Minor' },
    cosmetic: { icon: CheckCircle, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', label: 'Cosmetic' },
} as const

const STATUS_COLORS: Record<MeasureStatus, string> = {
    pending: 'border-zinc-300 hover:border-zinc-500',
    auditing: 'border-purple-500 bg-purple-50 animate-pulse',
    pass: 'border-green-400 bg-green-50',
    fail: 'border-red-400 bg-red-50',
    skipped: 'border-zinc-200 bg-zinc-100 opacity-60',
}

const MEASURES_PER_PAGE = 8

export default function ScoreAuditPage() {
    const params = useParams()
    const router = useRouter()
    const configId = params?.id as string

    // Data
    const [config, setConfig] = useState<SongConfig | null>(null)
    const [fullScore, setFullScore] = useState<IntermediateScore | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Pagination — render only a slice of measures at a time
    const [page, setPage] = useState(0)

    // Render result from VexFlow (for the current page's slice)
    const [renderResult, setRenderResult] = useState<VexFlowRenderResult | null>(null)
    const vexflowContainerRef = useRef<HTMLDivElement>(null)

    // Measure block state (keyed by absolute measure number)
    const [selectedMeasure, setSelectedMeasure] = useState<number | null>(null)
    const [measureStatuses, setMeasureStatuses] = useState<Map<number, MeasureStatus>>(new Map())
    const [measureResults, setMeasureResults] = useState<Map<number, AuditResult>>(new Map())
    const [referenceImages, setReferenceImages] = useState<Map<number, string>>(new Map())

    // Audit state
    const [auditError, setAuditError] = useState<string | null>(null)
    // (capturing removed — renders are uploaded manually now)

    // Model selection — start with defaults so dropdown is always visible
    const [models, setModels] = useState<{ id: string; name: string }[]>([
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
        { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ])
    const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-20250514')

    // Expanded findings
    const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set())

    // File input ref
    const fileInputRef = useRef<HTMLInputElement>(null)

    const measureCount = fullScore?.measures.length ?? 0
    const totalPages = Math.ceil(measureCount / MEASURES_PER_PAGE)

    // Paginated score slice (creates a new IntermediateScore with just the visible measures)
    const paginatedScore = useMemo<IntermediateScore | null>(() => {
        if (!fullScore) return null
        const start = page * MEASURES_PER_PAGE
        const end = Math.min(start + MEASURES_PER_PAGE, fullScore.measures.length)
        return {
            title: fullScore.title,
            measures: fullScore.measures.slice(start, end),
        }
    }, [fullScore, page])

    // Map from paginated measure index to absolute measure number
    const pageStartMeasure = page * MEASURES_PER_PAGE + 1

    // ── Load config + parse score ──
    useEffect(() => {
        async function load() {
            try {
                const cfg = await fetchConfigById(configId)
                if (!cfg) { setError('Config not found'); return }
                setConfig(cfg)
                if (cfg.xml_url) {
                    const parsed = await parseMusicXml(cfg.xml_url)
                    setFullScore(parsed)
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to load')
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [configId])

    // Fetch available models
    useEffect(() => {
        fetchAvailableModels().then(m => {
            if (m.length > 0) {
                setModels(m)
                setSelectedModel(m[0].id)
            }
        })
    }, [])

    // Load saved reference images from local filesystem
    useEffect(() => {
        if (!configId) return
        loadAllReferenceImages(configId).then(saved => {
            if (saved.size > 0) {
                setReferenceImages(prev => {
                    const merged = new Map(prev)
                    saved.forEach((v, k) => { if (!merged.has(k)) merged.set(k, v) })
                    return merged
                })
            }
        })
    }, [configId])

    // Render captures per measure (loaded from disk, captured by Playwright)
    const [renderCaptures, setRenderCaptures] = useState<Map<number, string>>(new Map())
    const [capturingMeasure, setCapturingMeasure] = useState<number | null>(null)

    // ── Handle render complete ──
    const handleRenderComplete = useCallback((result: VexFlowRenderResult) => {
        setRenderResult(result)
    }, [])

    // Load saved render captures from local filesystem
    useEffect(() => {
        if (!configId) return
        loadAllRenderCaptures(configId).then(saved => {
            if (saved.size > 0) {
                setRenderCaptures(prev => {
                    const merged = new Map(prev)
                    saved.forEach((v, k) => { if (!merged.has(k)) merged.set(k, v) })
                    return merged
                })
            }
        })
    }, [configId])

    // ── Capture single measure via Playwright ──
    const handleCaptureMeasure = useCallback(async (measureNum: number) => {
        setCapturingMeasure(measureNum)
        try {
            const baseUrl = window.location.origin
            const result = await captureMeasureRender(configId, measureNum, baseUrl)
            if ('dataUrl' in result) {
                setRenderCaptures(prev => new Map(prev).set(measureNum, result.dataUrl))
            } else {
                console.error(`Capture M${measureNum} failed:`, result.error)
                setAuditError(`Capture failed: ${result.error}`)
            }
        } catch (err) {
            console.error('Capture failed:', err)
            setAuditError(`Capture failed: ${err instanceof Error ? err.message : 'unknown'}`)
        } finally {
            setCapturingMeasure(null)
        }
    }, [configId])

    // ── Handle reference image upload for current measure ──
    const handleReferenceUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !selectedMeasure) return

        const reader = new FileReader()
        reader.onload = () => {
            const dataUrl = reader.result as string
            setReferenceImages(prev => new Map(prev).set(selectedMeasure, dataUrl))
            // Save to local filesystem for persistence + IDE AI access
            saveReferenceImage(configId, selectedMeasure, dataUrl).catch(err => {
                console.error('Failed to save reference locally:', err)
            })
        }
        reader.readAsDataURL(file)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [selectedMeasure, configId])

    // ── Run audit for selected measure ──
    const handleRunAudit = useCallback(async () => {
        if (!selectedMeasure) return
        const ref = referenceImages.get(selectedMeasure)
        if (!ref) return

        const rendered = renderCaptures.get(selectedMeasure)
        if (!rendered) {
            setAuditError('Upload a render screenshot first (use the "Save Render" button)')
            return
        }

        setAuditError(null)
        setMeasureStatuses(prev => new Map(prev).set(selectedMeasure, 'auditing'))

        try {

            const result = await runScoreAudit(ref, rendered, selectedModel, {
                start: selectedMeasure,
                end: selectedMeasure,
            })
            setMeasureResults(prev => new Map(prev).set(selectedMeasure, result))
            // Auto-save markdown for IDE AI consumption
            saveAuditResultMarkdown(configId, selectedMeasure, result).catch(() => {})
            setMeasureStatuses(prev => new Map(prev).set(
                selectedMeasure,
                result.findings.length === 0 ? 'pass' : 'fail',
            ))
            setExpandedFindings(new Set(result.findings.map(f => f.id)))
        } catch (e) {
            setAuditError(e instanceof Error ? e.message : 'Audit failed')
            setMeasureStatuses(prev => new Map(prev).set(selectedMeasure, 'pending'))
        }
    }, [selectedMeasure, referenceImages, renderCaptures, selectedModel])

    // ── Mark as OK / Skip ──
    const markAsPass = useCallback(() => {
        if (!selectedMeasure) return
        setMeasureStatuses(prev => new Map(prev).set(selectedMeasure, 'pass'))
    }, [selectedMeasure])

    const markAsSkipped = useCallback(() => {
        if (!selectedMeasure) return
        setMeasureStatuses(prev => new Map(prev).set(selectedMeasure, 'skipped'))
    }, [selectedMeasure])

    // ── Navigation ──
    const goToMeasure = useCallback((m: number) => {
        if (m >= 1 && m <= measureCount) {
            setSelectedMeasure(m)
            // Auto-switch page if measure is outside current page
            const targetPage = Math.floor((m - 1) / MEASURES_PER_PAGE)
            if (targetPage !== page) setPage(targetPage)
        }
    }, [measureCount, page])

    const goNext = useCallback(() => {
        if (selectedMeasure && selectedMeasure < measureCount) goToMeasure(selectedMeasure + 1)
    }, [selectedMeasure, measureCount, goToMeasure])

    const goPrev = useCallback(() => {
        if (selectedMeasure && selectedMeasure > 1) goToMeasure(selectedMeasure - 1)
    }, [selectedMeasure, goToMeasure])

    // ── Keyboard shortcuts ──
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
            if (e.key === 'ArrowRight') goNext()
            else if (e.key === 'ArrowLeft') goPrev()
            else if (e.key === 'Enter' && !e.shiftKey) handleRunAudit()
            else if (e.key === 'o' || e.key === 'O') markAsPass()
            else if (e.key === 's' && !e.metaKey && !e.ctrlKey) markAsSkipped()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [goNext, goPrev, handleRunAudit, markAsPass, markAsSkipped])

    // ── Progress stats ──
    const stats = {
        pass: [...measureStatuses.values()].filter(s => s === 'pass').length,
        fail: [...measureStatuses.values()].filter(s => s === 'fail').length,
        skipped: [...measureStatuses.values()].filter(s => s === 'skipped').length,
    }
    const reviewed = stats.pass + stats.fail + stats.skipped

    const toggleFinding = (id: string) => {
        setExpandedFindings(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    // Current measure data
    const currentRef = selectedMeasure ? referenceImages.get(selectedMeasure) : null
    const currentResult = selectedMeasure ? measureResults.get(selectedMeasure) : null
    const currentStatus = selectedMeasure ? (measureStatuses.get(selectedMeasure) ?? 'pending') : 'pending'

    // Is selected measure on the current page?
    const selectedOnPage = selectedMeasure
        ? selectedMeasure >= pageStartMeasure && selectedMeasure < pageStartMeasure + MEASURES_PER_PAGE
        : false

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-white">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-white gap-4">
                <p className="text-red-600">{error}</p>
                <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-white text-zinc-900 flex flex-col">
            {/* ── Header ── */}
            <div className="border-b border-zinc-200 px-6 py-3 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-semibold">Score Audit</h1>
                        <p className="text-sm text-zinc-500">{config?.title || 'Untitled'}</p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    {measureCount > 0 && (
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                            <span className="text-green-600">{stats.pass} pass</span>
                            <span className="text-red-600">{stats.fail} fail</span>
                            <span>{stats.skipped} skip</span>
                            <span>{reviewed}/{measureCount}</span>
                            <div className="w-32 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all"
                                    style={{ width: `${measureCount > 0 ? (reviewed / measureCount) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <label className="text-xs text-zinc-500">Model:</label>
                        <select
                            value={selectedModel}
                            onChange={e => setSelectedModel(e.target.value)}
                            className="bg-zinc-100 border border-zinc-300 rounded-md px-2 py-1 text-xs"
                        >
                            {models.map(m => (
                                <option key={m.id} value={m.id}>{m.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* ── Left: Paginated score ── */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Measure strip + pagination */}
                    <div className="border-b border-zinc-200 px-4 py-2 flex items-center gap-2 shrink-0">
                        <Button
                            variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </Button>

                        <div className="flex items-center gap-1 overflow-x-auto">
                            {Array.from({ length: measureCount }, (_, i) => i + 1).map(m => {
                                const status = measureStatuses.get(m) ?? 'pending'
                                const isSelected = m === selectedMeasure
                                const isOnPage = m >= pageStartMeasure && m < pageStartMeasure + MEASURES_PER_PAGE
                                return (
                                    <button
                                        key={m}
                                        onClick={() => goToMeasure(m)}
                                        className={`
                                            shrink-0 w-9 h-7 rounded text-[11px] font-mono border transition-all
                                            ${STATUS_COLORS[status]}
                                            ${isSelected ? 'ring-2 ring-purple-500 ring-offset-1 ring-offset-white' : ''}
                                            ${isOnPage ? '' : 'opacity-40'}
                                        `}
                                    >
                                        {m}
                                    </button>
                                )
                            })}
                        </div>

                        <Button
                            variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                            disabled={page >= totalPages - 1}
                        >
                            <ChevronRight className="w-4 h-4" />
                        </Button>

                        <span className="text-xs text-zinc-400 shrink-0 ml-2">
                            Page {page + 1}/{totalPages}
                        </span>
                    </div>

                    {/* VexFlow render — only the current page's measures */}
                    <div className="flex-1 overflow-auto relative" ref={vexflowContainerRef}>
                        {paginatedScore ? (
                            <div className="relative">
                                <VexFlowRenderer
                                    score={paginatedScore}
                                    musicFont="Bravura"
                                    onRenderComplete={handleRenderComplete}
                                />
                                {/* Clickable measure overlay */}
                                {renderResult && (
                                    <div className="absolute inset-0 pointer-events-none">
                                        {paginatedScore.measures.map((measure) => {
                                            const m = measure.measureNumber
                                            const x = renderResult.measureXMap.get(m)
                                            const w = renderResult.measureWidthMap.get(m)
                                            if (x === undefined || w === undefined) return null
                                            const status = measureStatuses.get(m) ?? 'pending'
                                            const isSelected = m === selectedMeasure
                                            return (
                                                <div
                                                    key={m}
                                                    className={`absolute pointer-events-auto cursor-pointer transition-all border-2 rounded-sm
                                                        ${isSelected ? 'border-purple-500 bg-purple-500/10' : ''}
                                                        ${!isSelected && status === 'pass' ? 'border-green-500/30 bg-green-500/5' : ''}
                                                        ${!isSelected && status === 'fail' ? 'border-red-500/30 bg-red-500/5' : ''}
                                                        ${!isSelected && status === 'pending' ? 'border-transparent hover:border-purple-300 hover:bg-purple-50/50' : ''}
                                                        ${!isSelected && status === 'skipped' ? 'border-zinc-300/50 bg-zinc-200/20' : ''}
                                                    `}
                                                    style={{
                                                        left: x,
                                                        top: renderResult.systemYMap.top,
                                                        width: w,
                                                        height: renderResult.systemYMap.height,
                                                    }}
                                                    onClick={() => setSelectedMeasure(m)}
                                                />
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-zinc-500 text-center p-8">
                                No score loaded
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: Measure detail panel ── */}
                <div className="w-[440px] border-l border-zinc-200 flex flex-col overflow-hidden shrink-0">
                    {selectedMeasure ? (
                        <>
                            {/* Panel header */}
                            <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between shrink-0">
                                <div className="flex items-center gap-2">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev} disabled={selectedMeasure <= 1}>
                                        <ChevronLeft className="w-4 h-4" />
                                    </Button>
                                    <span className="font-mono text-sm font-medium">Measure {selectedMeasure}</span>
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext} disabled={selectedMeasure >= measureCount}>
                                        <ChevronRight className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600" onClick={markAsPass} title="Mark OK (O)">
                                        <Check className="w-3.5 h-3.5 mr-1" /> OK
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-500" onClick={markAsSkipped} title="Skip (S)">
                                        <SkipForward className="w-3.5 h-3.5 mr-1" /> Skip
                                    </Button>
                                </div>
                            </div>

                            {/* Panel content */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {/* VexFlow render (captured by Playwright) */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">VexFlow Render</h3>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={() => selectedMeasure && handleCaptureMeasure(selectedMeasure)}
                                            disabled={!selectedMeasure || capturingMeasure === selectedMeasure}
                                        >
                                            {capturingMeasure === selectedMeasure ? (
                                                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Capturing...</>
                                            ) : (
                                                <>{selectedMeasure && renderCaptures.has(selectedMeasure) ? 'Re-capture' : 'Capture'}</>
                                            )}
                                        </Button>
                                    </div>
                                    <div className="border border-zinc-300 rounded-lg bg-white overflow-hidden min-h-[100px] flex items-center justify-center">
                                        {capturingMeasure === selectedMeasure ? (
                                            <div className="text-center p-4">
                                                <Loader2 className="w-5 h-5 animate-spin text-purple-400 mx-auto mb-1" />
                                                <p className="text-[10px] text-zinc-400">Headless browser capturing...</p>
                                            </div>
                                        ) : selectedMeasure && renderCaptures.has(selectedMeasure) ? (
                                            <img
                                                src={renderCaptures.get(selectedMeasure)}
                                                alt={`Measure ${selectedMeasure} render`}
                                                className="max-w-full"
                                            />
                                        ) : (
                                            <div className="text-center text-zinc-400 p-4">
                                                <p className="text-xs">Click Capture to screenshot this measure</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Reference image upload */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Reference</h3>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-6 text-xs"
                                            onClick={() => fileInputRef.current?.click()}
                                        >
                                            <Upload className="w-3 h-3 mr-1" />
                                            {currentRef ? 'Replace' : 'Upload'}
                                        </Button>
                                        <input
                                            ref={fileInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleReferenceUpload}
                                        />
                                    </div>
                                    <div className="border border-zinc-300 rounded-lg bg-zinc-50 min-h-[100px] flex items-center justify-center overflow-hidden">
                                        {currentRef ? (
                                            <img src={currentRef} alt="Reference" className="max-w-full" />
                                        ) : (
                                            <div className="text-center text-zinc-400 p-4">
                                                <Upload className="w-6 h-6 mx-auto mb-1 opacity-40" />
                                                <p className="text-xs">Upload reference for M{selectedMeasure}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Audit button */}
                                <Button
                                    onClick={handleRunAudit}
                                    disabled={!currentRef || !(selectedMeasure && renderCaptures.has(selectedMeasure)) || currentStatus === 'auditing'}
                                    className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                                >
                                    {currentStatus === 'auditing' ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing...</>
                                    ) : (
                                        <>Run Audit (Enter)</>
                                    )}
                                </Button>

                                {auditError && (
                                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">
                                        {auditError}
                                    </div>
                                )}

                                {/* Results for this measure */}
                                {currentResult && (
                                    <div className="space-y-3">
                                        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-3">
                                            <p className="text-sm text-zinc-700">{currentResult.summary}</p>
                                            <div className="flex gap-3 mt-2 text-xs">
                                                {(['critical', 'major', 'minor', 'cosmetic'] as const).map(sev => {
                                                    const count = currentResult.findings.filter(f => f.severity === sev).length
                                                    if (count === 0) return null
                                                    const cfg = SEVERITY_CONFIG[sev]
                                                    return (
                                                        <span key={sev} className={`${cfg.color} flex items-center gap-1`}>
                                                            <cfg.icon className="w-3 h-3" /> {count}
                                                        </span>
                                                    )
                                                })}
                                                {currentResult.findings.length === 0 && (
                                                    <span className="text-green-600 flex items-center gap-1">
                                                        <CheckCircle className="w-3 h-3" /> No issues
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {currentResult.findings.map(finding => {
                                            const cfg = SEVERITY_CONFIG[finding.severity]
                                            const expanded = expandedFindings.has(finding.id)
                                            return (
                                                <div key={finding.id} className={`border rounded-lg ${cfg.bg} overflow-hidden`}>
                                                    <button
                                                        onClick={() => toggleFinding(finding.id)}
                                                        className="w-full px-3 py-2 flex items-center gap-2 text-left"
                                                    >
                                                        <cfg.icon className={`w-3.5 h-3.5 ${cfg.color} shrink-0`} />
                                                        <span className="text-xs text-zinc-500 shrink-0">
                                                            {finding.beat ? `b${finding.beat}` : ''}
                                                        </span>
                                                        <span className="text-sm flex-1 truncate">{finding.description}</span>
                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-100 shrink-0">
                                                            {finding.category}
                                                        </span>
                                                        {expanded ? <ChevronUp className="w-3 h-3 text-zinc-500" /> : <ChevronDown className="w-3 h-3 text-zinc-500" />}
                                                    </button>
                                                    {expanded && (
                                                        <div className="px-3 pb-3 pt-1 border-t border-zinc-200 space-y-2 text-sm">
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <div>
                                                                    <span className="text-[10px] text-zinc-500 uppercase">Expected</span>
                                                                    <p className="text-green-600 text-xs">{finding.expected}</p>
                                                                </div>
                                                                <div>
                                                                    <span className="text-[10px] text-zinc-500 uppercase">Actual</span>
                                                                    <p className="text-red-600 text-xs">{finding.actual}</p>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] text-zinc-500 uppercase">Root Cause</span>
                                                                <p className="text-xs">
                                                                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mr-1 ${
                                                                        finding.rootCause === 'musicxml-parse' ? 'bg-purple-100 text-purple-700' :
                                                                        finding.rootCause === 'vexflow-render' ? 'bg-blue-100 text-blue-700' :
                                                                        finding.rootCause === 'normalization' ? 'bg-amber-100 text-amber-700' :
                                                                        finding.rootCause === 'musicxml-source' ? 'bg-zinc-100 text-zinc-600' :
                                                                        'bg-zinc-100 text-zinc-500'
                                                                    }`}>
                                                                        {finding.rootCause}
                                                                    </span>
                                                                </p>
                                                                <p className="text-zinc-600 text-xs mt-1">{finding.rootCauseExplanation}</p>
                                                            </div>
                                                            <div>
                                                                <span className="text-[10px] text-zinc-500 uppercase">Systemic Fix</span>
                                                                <p className="text-zinc-700 text-xs">{finding.suggestedFix}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Keyboard hint */}
                            <div className="px-4 py-2 border-t border-zinc-200 text-[10px] text-zinc-400 flex gap-3 shrink-0">
                                <span>← → navigate</span>
                                <span>Enter audit</span>
                                <span>O mark ok</span>
                                <span>S skip</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-zinc-400 text-sm p-8 text-center">
                            Click a measure block above or in the score to start auditing
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
