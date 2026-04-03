'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    ArrowLeft, Upload, Loader2, AlertTriangle, CheckCircle, Info, XCircle,
    ChevronDown, ChevronUp, ChevronLeft, ChevronRight, SkipForward, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseMusicXml } from '@/lib/score/MusicXmlParser'
import type { IntermediateScore } from '@/lib/score/IntermediateScore'
import { VexFlowRenderer, type VexFlowRenderResult } from '@/components/score/VexFlowRenderer'
import { rasterizeScore, cropMeasure, clearCache } from '@/components/score/measureCropper'
import { fetchConfigById } from '@/app/actions/config'
import { runScoreAudit, fetchAvailableModels, type AuditFinding, type AuditResult } from '@/app/actions/scoreAudit'
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

export default function ScoreAuditPage() {
    const params = useParams()
    const router = useRouter()
    const configId = params?.id as string

    // Data
    const [config, setConfig] = useState<SongConfig | null>(null)
    const [score, setScore] = useState<IntermediateScore | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Render result from VexFlow
    const [renderResult, setRenderResult] = useState<VexFlowRenderResult | null>(null)
    const vexflowContainerRef = useRef<HTMLDivElement>(null)

    // Measure block state
    const [selectedMeasure, setSelectedMeasure] = useState<number | null>(null)
    const [measureStatuses, setMeasureStatuses] = useState<Map<number, MeasureStatus>>(new Map())
    const [measureResults, setMeasureResults] = useState<Map<number, AuditResult>>(new Map())
    const [referenceImages, setReferenceImages] = useState<Map<number, string>>(new Map())
    const [croppedRenders, setCroppedRenders] = useState<Map<number, string>>(new Map())

    // Audit state
    const [auditError, setAuditError] = useState<string | null>(null)

    // Model selection
    const [models, setModels] = useState<{ id: string; name: string }[]>([])
    const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-20250514')

    // Expanded findings
    const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set())

    // File input ref (per-measure)
    const fileInputRef = useRef<HTMLInputElement>(null)

    // ── Load config + parse score ──
    useEffect(() => {
        async function load() {
            try {
                const cfg = await fetchConfigById(configId)
                if (!cfg) { setError('Config not found'); return }
                setConfig(cfg)
                if (cfg.xml_url) {
                    const parsed = await parseMusicXml(cfg.xml_url)
                    setScore(parsed)
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

    // Full-score rasterized canvas (for per-measure cropping)
    const [scoreRasterized, setScoreRasterized] = useState(false)

    // ── Handle render complete — rasterize full score once ──
    const handleRenderComplete = useCallback((result: VexFlowRenderResult) => {
        setRenderResult(result)
        // Clear old crops + raster cache when score re-renders
        clearCache()
        setCroppedRenders(new Map())
        setScoreRasterized(false)

        // Rasterize after a short delay to ensure fonts are settled
        const container = vexflowContainerRef.current
        if (container) {
            setTimeout(() => {
                rasterizeScore(container).then(() => {
                    setScoreRasterized(true)
                }).catch(err => {
                    console.error('Score rasterization failed:', err)
                })
            }, 500)
        }
    }, [])

    // ── Auto-crop when a measure is selected (from rasterized canvas) ──
    useEffect(() => {
        if (!selectedMeasure || !renderResult || !scoreRasterized) return
        if (croppedRenders.has(selectedMeasure)) return

        const x = renderResult.measureXMap.get(selectedMeasure)
        const w = renderResult.measureWidthMap.get(selectedMeasure)
        if (x === undefined || w === undefined) return

        try {
            const png = cropMeasure(x, w, renderResult.systemYMap)
            setCroppedRenders(prev => new Map(prev).set(selectedMeasure, png))
        } catch (err) {
            console.error('Crop failed:', err)
        }
    }, [selectedMeasure, renderResult, scoreRasterized, croppedRenders])

    // ── Handle reference image upload for current measure ──
    const handleReferenceUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || !selectedMeasure) return

        const reader = new FileReader()
        reader.onload = () => {
            setReferenceImages(prev => new Map(prev).set(selectedMeasure, reader.result as string))
        }
        reader.readAsDataURL(file)
        // Reset input so same file can be re-uploaded
        if (fileInputRef.current) fileInputRef.current.value = ''
    }, [selectedMeasure])

    // ── Run audit for selected measure ──
    const handleRunAudit = useCallback(async () => {
        if (!selectedMeasure) return
        const ref = referenceImages.get(selectedMeasure)
        const rendered = croppedRenders.get(selectedMeasure)
        if (!ref || !rendered) return

        setAuditError(null)
        setMeasureStatuses(prev => new Map(prev).set(selectedMeasure, 'auditing'))

        try {
            const result = await runScoreAudit(ref, rendered, selectedModel, {
                start: selectedMeasure,
                end: selectedMeasure,
            })
            setMeasureResults(prev => new Map(prev).set(selectedMeasure, result))
            setMeasureStatuses(prev => new Map(prev).set(
                selectedMeasure,
                result.findings.length === 0 ? 'pass' : 'fail',
            ))
            setExpandedFindings(new Set(result.findings.map(f => f.id)))
        } catch (e) {
            setAuditError(e instanceof Error ? e.message : 'Audit failed')
            setMeasureStatuses(prev => new Map(prev).set(selectedMeasure, 'pending'))
        }
    }, [selectedMeasure, referenceImages, croppedRenders, selectedModel])

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
    const measureCount = renderResult?.measureCount ?? score?.measures.length ?? 0
    const goToMeasure = useCallback((m: number) => {
        if (m >= 1 && m <= measureCount) setSelectedMeasure(m)
    }, [measureCount])

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
    const currentCrop = selectedMeasure ? croppedRenders.get(selectedMeasure) : null
    const currentResult = selectedMeasure ? measureResults.get(selectedMeasure) : null
    const currentStatus = selectedMeasure ? (measureStatuses.get(selectedMeasure) ?? 'pending') : 'pending'

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
                    {/* Progress */}
                    {measureCount > 0 && (
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                            <span className="text-green-600">{stats.pass} pass</span>
                            <span className="text-red-600">{stats.fail} fail</span>
                            <span className="text-zinc-500">{stats.skipped} skip</span>
                            <span>{reviewed}/{measureCount}</span>
                            <div className="w-32 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all"
                                    style={{ width: `${measureCount > 0 ? (reviewed / measureCount) * 100 : 0}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Model selector */}
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
                {/* ── Left: Score with clickable measure blocks ── */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Measure block strip */}
                    <div className="border-b border-zinc-200 px-4 py-2 flex items-center gap-1 overflow-x-auto shrink-0">
                        {Array.from({ length: measureCount }, (_, i) => i + 1).map(m => {
                            const status = measureStatuses.get(m) ?? 'pending'
                            const isSelected = m === selectedMeasure
                            return (
                                <button
                                    key={m}
                                    onClick={() => setSelectedMeasure(m)}
                                    className={`
                                        shrink-0 w-10 h-8 rounded text-xs font-mono border transition-all
                                        ${STATUS_COLORS[status]}
                                        ${isSelected ? 'ring-2 ring-purple-500 ring-offset-1 ring-offset-white' : ''}
                                    `}
                                >
                                    {m}
                                </button>
                            )
                        })}
                    </div>

                    {/* VexFlow render with overlay */}
                    <div className="flex-1 overflow-auto relative" ref={vexflowContainerRef}>
                        {score ? (
                            <div className="relative">
                                <VexFlowRenderer
                                    score={score}
                                    musicFont="Bravura"
                                    onRenderComplete={handleRenderComplete}
                                />
                                {/* Clickable measure overlay */}
                                {renderResult && (
                                    <div className="absolute inset-0 pointer-events-none">
                                        {Array.from({ length: measureCount }, (_, i) => i + 1).map(m => {
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
                                No score loaded — upload a MusicXML file in the editor first
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
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-green-600 hover:text-green-300" onClick={markAsPass} title="Mark OK (O)">
                                        <Check className="w-3.5 h-3.5 mr-1" /> OK
                                    </Button>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-500 hover:text-zinc-700" onClick={markAsSkipped} title="Skip (S)">
                                        <SkipForward className="w-3.5 h-3.5 mr-1" /> Skip
                                    </Button>
                                </div>
                            </div>

                            {/* Panel content */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {/* Cropped VexFlow render */}
                                <div className="space-y-2">
                                    <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wide">VexFlow Render</h3>
                                    <div className="border border-zinc-300 rounded-lg bg-white p-2 flex items-center justify-center min-h-[100px]">
                                        {currentCrop ? (
                                            <img src={currentCrop} alt={`Measure ${selectedMeasure} render`} className="max-w-full" />
                                        ) : (
                                            <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
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
                                            <div className="text-center text-zinc-600 p-4">
                                                <Upload className="w-6 h-6 mx-auto mb-1 opacity-40" />
                                                <p className="text-xs">Upload reference for M{selectedMeasure}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Audit button */}
                                <Button
                                    onClick={handleRunAudit}
                                    disabled={!currentRef || !currentCrop || currentStatus === 'auditing'}
                                    className="w-full bg-purple-600 hover:bg-purple-700"
                                >
                                    {currentStatus === 'auditing' ? (
                                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing M{selectedMeasure}...</>
                                    ) : (
                                        <>Run Audit (Enter)</>
                                    )}
                                </Button>

                                {auditError && (
                                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-600 text-sm">
                                        {auditError}
                                    </div>
                                )}

                                {/* Results for this measure */}
                                {currentResult && (
                                    <div className="space-y-3">
                                        {/* Summary */}
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

                                        {/* Findings */}
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
                                                        <div className="px-3 pb-3 pt-1 border-t border-zinc-300/50 space-y-2 text-sm">
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
                                                                <span className="text-[10px] text-zinc-500 uppercase">Suggested Fix</span>
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
                            <div className="px-4 py-2 border-t border-zinc-200 text-[10px] text-zinc-600 flex gap-3 shrink-0">
                                <span>← → navigate</span>
                                <span>Enter audit</span>
                                <span>O mark ok</span>
                                <span>S skip</span>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center text-zinc-600 text-sm p-8 text-center">
                            Click a measure block above or in the score to start auditing
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
