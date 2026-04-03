'use client'

import * as React from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Upload, Camera, Loader2, AlertTriangle, CheckCircle, Info, XCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseMusicXml } from '@/lib/score/MusicXmlParser'
import type { IntermediateScore } from '@/lib/score/IntermediateScore'
import { VexFlowRenderer } from '@/components/score/VexFlowRenderer'
import { fetchConfigById } from '@/app/actions/config'
import { runScoreAudit, fetchAvailableModels, type AuditFinding, type AuditResult } from '@/app/actions/scoreAudit'
import type { SongConfig } from '@/lib/types'

const SEVERITY_CONFIG = {
    critical: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30', label: 'Critical' },
    major: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30', label: 'Major' },
    minor: { icon: Info, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30', label: 'Minor' },
    cosmetic: { icon: CheckCircle, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30', label: 'Cosmetic' },
} as const

export default function ScoreAuditPage() {
    const params = useParams()
    const router = useRouter()
    const configId = params?.id as string

    const [config, setConfig] = useState<SongConfig | null>(null)
    const [score, setScore] = useState<IntermediateScore | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Reference image
    const [referenceImage, setReferenceImage] = useState<string | null>(null)
    const [referenceFileName, setReferenceFileName] = useState<string>('')
    const fileInputRef = useRef<HTMLInputElement>(null)

    // Rendered image capture
    const [renderedImage, setRenderedImage] = useState<string | null>(null)
    const [capturing, setCapturing] = useState(false)
    const vexflowContainerRef = useRef<HTMLDivElement>(null)

    // Audit state
    const [auditing, setAuditing] = useState(false)
    const [auditResult, setAuditResult] = useState<AuditResult | null>(null)
    const [auditError, setAuditError] = useState<string | null>(null)

    // Model selection
    const [models, setModels] = useState<{ id: string; name: string }[]>([])
    const [selectedModel, setSelectedModel] = useState<string>('claude-sonnet-4-20250514')

    // Collapsible sections
    const [showFindings, setShowFindings] = useState(true)
    const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set())

    // Load config and parse score
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

    // Handle reference image upload
    const handleReferenceUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setReferenceFileName(file.name)
        const reader = new FileReader()
        reader.onload = () => {
            setReferenceImage(reader.result as string)
        }
        reader.readAsDataURL(file)
    }, [])

    // Capture VexFlow render as image
    const captureRender = useCallback(async () => {
        const container = vexflowContainerRef.current
        if (!container) return

        setCapturing(true)
        try {
            // Dynamic import to avoid SSR issues
            const { default: html2canvas } = await import('html2canvas-pro')
            const canvas = await html2canvas(container, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
            })
            setRenderedImage(canvas.toDataURL('image/png'))
        } catch (e) {
            console.error('Capture failed:', e)
            setAuditError('Failed to capture VexFlow render')
        } finally {
            setCapturing(false)
        }
    }, [])

    // Run audit
    const handleRunAudit = useCallback(async () => {
        if (!referenceImage || !renderedImage) return

        setAuditing(true)
        setAuditError(null)
        setAuditResult(null)

        try {
            const result = await runScoreAudit(
                referenceImage,
                renderedImage,
                selectedModel,
            )
            setAuditResult(result)
            setShowFindings(true)
            // Expand all findings by default
            setExpandedFindings(new Set(result.findings.map(f => f.id)))
        } catch (e) {
            setAuditError(e instanceof Error ? e.message : 'Audit failed')
        } finally {
            setAuditing(false)
        }
    }, [referenceImage, renderedImage, selectedModel])

    const toggleFinding = (id: string) => {
        setExpandedFindings(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-zinc-950">
                <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen bg-zinc-950 gap-4">
                <p className="text-red-400">{error}</p>
                <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-zinc-950 text-white">
            {/* Header */}
            <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.back()}>
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-semibold">Score Audit</h1>
                        <p className="text-sm text-zinc-400">{config?.title || 'Untitled'}</p>
                    </div>
                </div>

                {/* Model selector */}
                <div className="flex items-center gap-3">
                    <label className="text-sm text-zinc-400">Model:</label>
                    <select
                        value={selectedModel}
                        onChange={e => setSelectedModel(e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded-md px-3 py-1.5 text-sm"
                    >
                        {models.map(m => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="p-6 space-y-6">
                {/* Step 1 + 2: Side by side image panels */}
                <div className="grid grid-cols-2 gap-6">
                    {/* Reference Panel */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">
                                1. Reference (Correct)
                            </h2>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="w-4 h-4 mr-2" />
                                {referenceImage ? 'Replace' : 'Upload'}
                            </Button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.pdf"
                                className="hidden"
                                onChange={handleReferenceUpload}
                            />
                        </div>
                        <div className="border border-zinc-700 rounded-lg bg-zinc-900 min-h-[300px] flex items-center justify-center overflow-auto">
                            {referenceImage ? (
                                <img
                                    src={referenceImage}
                                    alt="Reference score"
                                    className="max-w-full"
                                />
                            ) : (
                                <div className="text-center text-zinc-500 p-8">
                                    <Upload className="w-10 h-10 mx-auto mb-3 opacity-50" />
                                    <p className="text-sm">Upload a reference image or PDF</p>
                                    <p className="text-xs text-zinc-600 mt-1">Screenshot from Sibelius, IMSLP, Henle, etc.</p>
                                </div>
                            )}
                        </div>
                        {referenceFileName && (
                            <p className="text-xs text-zinc-500">{referenceFileName}</p>
                        )}
                    </div>

                    {/* Rendered Panel */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">
                                2. VexFlow Render
                            </h2>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={captureRender}
                                disabled={!score || capturing}
                            >
                                {capturing ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Camera className="w-4 h-4 mr-2" />
                                )}
                                {renderedImage ? 'Re-capture' : 'Capture'}
                            </Button>
                        </div>
                        <div className="border border-zinc-700 rounded-lg bg-zinc-900 min-h-[300px] overflow-auto">
                            {renderedImage ? (
                                <img
                                    src={renderedImage}
                                    alt="VexFlow render"
                                    className="max-w-full"
                                />
                            ) : (
                                <div className="text-zinc-500 text-center p-4 text-sm">
                                    Click &quot;Capture&quot; to screenshot the render below
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Run Audit Button */}
                <div className="flex items-center gap-4">
                    <Button
                        onClick={handleRunAudit}
                        disabled={!referenceImage || !renderedImage || auditing}
                        className="bg-purple-600 hover:bg-purple-700"
                        size="lg"
                    >
                        {auditing ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Analyzing...
                            </>
                        ) : (
                            'Run Score Audit'
                        )}
                    </Button>
                    {!referenceImage && <span className="text-sm text-zinc-500">Upload a reference image first</span>}
                    {referenceImage && !renderedImage && <span className="text-sm text-zinc-500">Capture the VexFlow render first</span>}
                </div>

                {auditError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
                        {auditError}
                    </div>
                )}

                {/* Audit Results */}
                {auditResult && (
                    <div className="space-y-4">
                        {/* Summary */}
                        <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-medium">Audit Summary</h3>
                                <span className="text-xs text-zinc-500">Model: {auditResult.modelUsed}</span>
                            </div>
                            <p className="text-sm text-zinc-300">{auditResult.summary}</p>
                            <div className="flex gap-4 mt-3 text-xs">
                                {(['critical', 'major', 'minor', 'cosmetic'] as const).map(sev => {
                                    const count = auditResult.findings.filter(f => f.severity === sev).length
                                    if (count === 0) return null
                                    const cfg = SEVERITY_CONFIG[sev]
                                    return (
                                        <span key={sev} className={`${cfg.color} flex items-center gap-1`}>
                                            <cfg.icon className="w-3.5 h-3.5" />
                                            {count} {cfg.label}
                                        </span>
                                    )
                                })}
                                {auditResult.findings.length === 0 && (
                                    <span className="text-green-400 flex items-center gap-1">
                                        <CheckCircle className="w-3.5 h-3.5" /> No issues found
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Findings List */}
                        {auditResult.findings.length > 0 && (
                            <div className="space-y-2">
                                <button
                                    onClick={() => setShowFindings(!showFindings)}
                                    className="flex items-center gap-2 text-sm font-medium text-zinc-300 hover:text-white"
                                >
                                    {showFindings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                    Findings ({auditResult.findings.length})
                                </button>

                                {showFindings && (
                                    <div className="space-y-2">
                                        {auditResult.findings.map(finding => {
                                            const cfg = SEVERITY_CONFIG[finding.severity]
                                            const expanded = expandedFindings.has(finding.id)

                                            return (
                                                <div
                                                    key={finding.id}
                                                    className={`border rounded-lg ${cfg.bg} overflow-hidden`}
                                                >
                                                    <button
                                                        onClick={() => toggleFinding(finding.id)}
                                                        className="w-full px-4 py-3 flex items-center gap-3 text-left"
                                                    >
                                                        <cfg.icon className={`w-4 h-4 ${cfg.color} shrink-0`} />
                                                        <span className="text-xs text-zinc-500 shrink-0 w-16">
                                                            {finding.measure ? `M${finding.measure}` : '—'}
                                                            {finding.beat ? ` b${finding.beat}` : ''}
                                                        </span>
                                                        <span className="text-xs text-zinc-500 shrink-0 w-12 uppercase">
                                                            {finding.staff || '—'}
                                                        </span>
                                                        <span className="text-sm flex-1 truncate">
                                                            {finding.description}
                                                        </span>
                                                        <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0 px-2 py-0.5 rounded bg-zinc-800">
                                                            {finding.category}
                                                        </span>
                                                        {expanded ? (
                                                            <ChevronUp className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                                        ) : (
                                                            <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                                                        )}
                                                    </button>
                                                    {expanded && (
                                                        <div className="px-4 pb-4 pt-1 border-t border-zinc-700/50 space-y-2 text-sm">
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div>
                                                                    <span className="text-xs text-zinc-500">Expected (Reference)</span>
                                                                    <p className="text-green-400">{finding.expected}</p>
                                                                </div>
                                                                <div>
                                                                    <span className="text-xs text-zinc-500">Actual (Render)</span>
                                                                    <p className="text-red-400">{finding.actual}</p>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <span className="text-xs text-zinc-500">Suggested Fix</span>
                                                                <p className="text-zinc-300">{finding.suggestedFix}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* VexFlow Live Render (for capture) */}
                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-zinc-300 uppercase tracking-wide">
                        Live VexFlow Render
                    </h2>
                    <div
                        ref={vexflowContainerRef}
                        className="border border-zinc-700 rounded-lg bg-white overflow-auto"
                    >
                        {score ? (
                            <VexFlowRenderer
                                score={score}
                                musicFont="Bravura"
                                onRenderComplete={() => {}}
                            />
                        ) : (
                            <div className="text-zinc-500 text-center p-8">
                                No score loaded — upload a MusicXML file in the editor first
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
