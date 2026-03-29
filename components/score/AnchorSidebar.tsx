'use client'

import * as React from 'react'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Anchor, BeatAnchor, V5MapperState } from '@/lib/types'

interface AnchorSidebarProps {
    anchors: Anchor[]
    beatAnchors?: BeatAnchor[]
    currentMeasure: number
    totalMeasures: number
    isLevel2Mode: boolean
    subdivision: number
    darkMode?: boolean
    onSetAnchor: (measure: number, time: number) => void
    onDeleteAnchor: (measure: number) => void
    onToggleLevel2: (enabled: boolean) => void
    onSetSubdivision: (sub: number) => void
    onSetBeatAnchor?: (measure: number, beat: number, time: number) => void
    onRegenerateBeats?: () => void
    onTap?: () => void
    onClearAll?: () => void
    onAutoMap?: () => void
    onAutoMapV4?: () => void
    onAutoMapV5?: (chordThresholdFraction: number) => void
    onConfirmGhost?: () => void
    onProceedMapping?: () => void
    onRunV5ToEnd?: () => void
    onUpdateGhostTime?: (time: number) => void
    v5State?: V5MapperState | null
    isAiMapping?: boolean
}

export const AnchorSidebar: React.FC<AnchorSidebarProps> = ({
    anchors,
    beatAnchors = [],
    currentMeasure,
    totalMeasures,
    isLevel2Mode,
    subdivision,
    darkMode = false,
    onSetAnchor,
    onDeleteAnchor,
    onToggleLevel2,
    onSetSubdivision,
    onSetBeatAnchor,
    onRegenerateBeats,
    onTap,
    onClearAll,
    onAutoMap,
    onAutoMapV4,
    onAutoMapV5,
    onConfirmGhost,
    onProceedMapping,
    onRunV5ToEnd,
    onUpdateGhostTime,
    v5State = null,
    isAiMapping = false,
}) => {
    const bg = darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900'
    const border = darkMode ? 'border-zinc-700' : 'border-zinc-200'

    const sortedAnchors = [...anchors].sort((a, b) => a.measure - b.measure)
    const maxMeasure = anchors.length > 0 ? Math.max(...anchors.map(a => a.measure)) : 0
    const rows = []

    for (let m = 1; m <= maxMeasure + 1; m++) {
        const anchor = anchors.find(a => a.measure === m)
        const isCurrent = m === currentMeasure

        if (anchor) {
            const beats = isLevel2Mode && beatAnchors.length > 0
                ? beatAnchors.filter(b => b.measure === m).sort((a, b) => a.beat - b.beat)
                : []

            rows.push(
                <React.Fragment key={m}>
                    <div className={`flex items-center gap-2 p-2 rounded text-xs mt-1 ${isCurrent
                        ? darkMode ? 'bg-purple-900/30 border border-purple-500/30' : 'bg-purple-50 border border-purple-200'
                        : darkMode ? 'hover:bg-zinc-800' : 'hover:bg-zinc-50'
                        }`}>
                        <span className="font-mono font-medium w-8">M{m}</span>
                        <input
                            type="number"
                            value={anchor.time.toFixed(2)}
                            step={0.01}
                            onChange={(e) => onSetAnchor(m, parseFloat(e.target.value) || 0)}
                            className={`flex-1 px-2 py-1 rounded font-mono text-xs ${darkMode ? 'bg-zinc-800 border-zinc-600 text-emerald-400' : 'bg-zinc-100 border-zinc-300 text-emerald-600'} border`}
                        />
                        <span className="text-zinc-500">s</span>
                        {m !== 1 && (
                            <button onClick={() => onDeleteAnchor(m)} className="text-red-400 hover:text-red-500 p-0.5">
                                <Trash2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>

                    {beats.length > 0 && (
                        <div className={`pl-8 pr-2 pb-2 text-xs border-b ${darkMode ? 'border-zinc-800 bg-zinc-900/50' : 'border-zinc-100 bg-zinc-50/50'}`}>
                            <div className="grid grid-cols-2 gap-2 mt-1">
                                {beats.map(b => (
                                    <div key={`${m}-${b.beat}`} className="flex items-center justify-end gap-1">
                                        <span className={`text-[9px] font-bold ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>B{b.beat}</span>
                                        <input
                                            type="number" step="0.01" value={b.time.toFixed(2)}
                                            onChange={(e) => onSetBeatAnchor && onSetBeatAnchor(m, b.beat, parseFloat(e.target.value) || 0)}
                                            className={`w-14 text-right text-[10px] border rounded px-1 font-mono focus:outline-none focus:ring-1 ${darkMode
                                                ? 'bg-zinc-800 border-zinc-600 text-yellow-500 focus:ring-yellow-500'
                                                : 'bg-yellow-50 border-yellow-200 text-zinc-700 focus:bg-white focus:ring-yellow-400'
                                                }`}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </React.Fragment>
            )
        } else {
            rows.push(
                <div key={m} className={`flex items-center justify-between mt-1 p-2 rounded text-xs border border-dashed opacity-60 ${darkMode ? 'border-red-800 bg-red-900/20' : 'border-red-200 bg-red-50'}`}>
                    <span className={`font-mono ${darkMode ? 'text-red-400' : 'text-red-400'}`}>M{m} (Ghost)</span>
                </div>
            )
        }
    }

    return (
        <div className={`w-64 ${bg} border-r ${border} flex flex-col h-full overflow-hidden shrink-0`}>
            <div className={`p-3 border-b ${border} flex items-center justify-between`}>
                <h2 className="text-sm font-semibold">Anchors</h2>
                <span className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    {anchors.length} / {totalMeasures} measures
                </span>
            </div>

            <div className={`p-3 border-b ${border} space-y-2`}>
                <label className="flex items-center gap-2 text-xs">
                    <input
                        type="checkbox"
                        checked={isLevel2Mode}
                        onChange={(e) => onToggleLevel2(e.target.checked)}
                        className="rounded"
                    />
                    Beat-level mapping (L2)
                </label>
                {isLevel2Mode && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs">Subdivision:</span>
                            <select
                                value={subdivision}
                                onChange={(e) => onSetSubdivision(Number(e.target.value))}
                                className={`text-xs px-2 py-1 rounded ${darkMode ? 'bg-zinc-800 border-zinc-600' : 'bg-zinc-100 border-zinc-300'} border`}
                            >
                                {[2, 3, 4, 6, 8, 12, 16].map((n) => (
                                    <option key={n} value={n}>{n}</option>
                                ))}
                            </select>
                        </div>
                        {onRegenerateBeats && (
                            <button
                                onClick={onRegenerateBeats}
                                className={`w-full text-xs font-bold py-1.5 rounded border transition-colors shadow-sm ${darkMode
                                    ? 'bg-emerald-900/40 border-emerald-700 text-emerald-400 hover:bg-emerald-800 hover:text-white'
                                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                                    }`}
                            >
                                {beatAnchors.length > 0 ? '↻ Regenerate Beats' : '▶ Generate Beats'}
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {rows}
            </div>

            <V5Controls
                darkMode={darkMode}
                border={border}
                currentMeasure={currentMeasure}
                isAiMapping={isAiMapping}
                v5State={v5State}
                onClearAll={onClearAll}
                onTap={onTap}
                onAutoMap={onAutoMap}
                onAutoMapV4={onAutoMapV4}
                onAutoMapV5={onAutoMapV5}
                onConfirmGhost={onConfirmGhost}
                onProceedMapping={onProceedMapping}
                onRunV5ToEnd={onRunV5ToEnd}
                onUpdateGhostTime={onUpdateGhostTime}
            />
        </div>
    )
}

// ─── V5Controls Sub-Component ──────────────────────────────────────────
interface V5ControlsProps {
    darkMode: boolean
    border: string
    currentMeasure: number
    isAiMapping: boolean
    v5State?: V5MapperState | null
    onClearAll?: () => void
    onTap?: () => void
    onAutoMap?: () => void
    onAutoMapV4?: () => void
    onAutoMapV5?: (chordThresholdFraction: number) => void
    onConfirmGhost?: () => void
    onProceedMapping?: () => void
    onRunV5ToEnd?: () => void
    onUpdateGhostTime?: (time: number) => void
}

const V5Controls: React.FC<V5ControlsProps> = ({
    darkMode, border, currentMeasure, isAiMapping, v5State,
    onClearAll, onTap, onAutoMap, onAutoMapV4, onAutoMapV5,
    onConfirmGhost, onProceedMapping, onRunV5ToEnd, onUpdateGhostTime,
}) => {
    const [selectedVersion, setSelectedVersion] = useState<'v3' | 'v4' | 'v5'>('v5')
    const [chordThreshold, setChordThreshold] = useState<number>(0.0625) // 64th note default

    const isV5Active = v5State && (v5State.status === 'running' || v5State.status === 'paused')

    const handleRunAutoMap = () => {
        if (selectedVersion === 'v3' && onAutoMap) onAutoMap()
        else if (selectedVersion === 'v4' && onAutoMapV4) onAutoMapV4()
        else if (selectedVersion === 'v5' && onAutoMapV5) onAutoMapV5(chordThreshold)
    }

    return (
        <div className={`p-3 border-t ${border} flex flex-col gap-3`}>
            <div className="text-center">
                <span className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Current: Measure {currentMeasure}
                </span>
            </div>

            {/* Version Selector */}
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <span className={`text-xs font-medium ${darkMode ? 'text-zinc-300' : 'text-zinc-600'}`}>Mapping:</span>
                    <select
                        value={selectedVersion}
                        onChange={(e) => setSelectedVersion(e.target.value as 'v3' | 'v4' | 'v5')}
                        disabled={isAiMapping || !!isV5Active}
                        className={`flex-1 text-xs px-2 py-1 rounded ${darkMode ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-100 border-zinc-300 text-zinc-800'
                            } border disabled:opacity-50`}
                    >
                        <option value="v3">V3 — AI + Heuristic</option>
                        <option value="v4">V4 — Note-by-Note</option>
                        <option value="v5">V5 — Echolocation</option>
                    </select>
                </div>

                {/* V5 Chord Threshold Config */}
                {selectedVersion === 'v5' && !isV5Active && (
                    <div className="flex items-center gap-2">
                        <span className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Chord Threshold:</span>
                        <select
                            value={chordThreshold}
                            onChange={(e) => setChordThreshold(Number(e.target.value))}
                            className={`flex-1 text-xs px-2 py-1 rounded ${darkMode ? 'bg-zinc-800 border-zinc-600 text-white' : 'bg-zinc-100 border-zinc-300'
                                } border`}
                        >
                            <option value={0.0625}>64th note (tightest)</option>
                            <option value={0.125}>32nd note</option>
                            <option value={0.25}>16th note (loosest)</option>
                        </select>
                    </div>
                )}
            </div>

            {/* V5 Paused State: Ghost Anchor Controls */}
            {v5State?.status === 'paused' && v5State.ghostAnchor && (
                <div className={`space-y-2 p-2 rounded border border-dashed ${darkMode ? 'border-orange-600 bg-orange-900/20' : 'border-orange-300 bg-orange-50'
                    }`}>
                    <div className={`text-xs font-bold ${darkMode ? 'text-orange-400' : 'text-orange-600'}`}>
                        ⚠ No match at M{v5State.ghostAnchor.measure} B{v5State.ghostAnchor.beat}
                    </div>
                    <div className="flex items-center gap-1">
                        <span className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>Ghost:</span>
                        <input
                            type="number"
                            step="0.01"
                            value={v5State.ghostAnchor.time.toFixed(3)}
                            onChange={(e) => onUpdateGhostTime?.(parseFloat(e.target.value) || 0)}
                            className={`flex-1 px-2 py-1 rounded font-mono text-xs border ${darkMode ? 'bg-zinc-800 border-orange-600 text-orange-400' : 'bg-orange-50 border-orange-300 text-orange-700'
                                }`}
                        />
                        <span className={`text-xs ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>s</span>
                    </div>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={onConfirmGhost}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs h-7">
                            ✓ Confirm
                        </Button>
                        <Button size="sm" onClick={onProceedMapping}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs h-7">
                            ▶ Proceed
                        </Button>
                    </div>
                    <Button size="sm" variant="outline" onClick={onRunV5ToEnd}
                        className={`w-full text-xs h-7 ${darkMode ? 'border-zinc-600 text-zinc-300' : ''}`}>
                        ⏩ Run to End (auto-confirm all)
                    </Button>
                </div>
            )}

            {/* V5 Running State */}
            {v5State?.status === 'running' && (
                <div className={`text-center text-xs py-2 rounded ${darkMode ? 'bg-emerald-900/30 text-emerald-400' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                    ⏳ Mapping... Event {v5State.currentEventIndex} | AQNTL {(60 / v5State.aqntl).toFixed(0)} BPM
                </div>
            )}

            {/* V5 Done State */}
            {v5State?.status === 'done' && (
                <div className={`text-center text-xs py-2 rounded ${darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'
                    }`}>
                    ✓ V5 Complete — {v5State.anchors.length} anchors, {v5State.beatAnchors.length} beats
                </div>
            )}

            <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={onClearAll}
                    className={`text-xs h-8 ${darkMode ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-300' : ''}`}>
                    Clear All
                </Button>
                <Button size="sm" onClick={onTap}
                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs h-8 shadow-lg shadow-purple-500/20">
                    TAP (A)
                </Button>
                <Button
                    size="sm"
                    onClick={handleRunAutoMap}
                    disabled={isAiMapping || !!isV5Active}
                    className={`col-span-2 text-white text-xs h-8 transition-all disabled:opacity-50 ${selectedVersion === 'v5'
                            ? 'bg-amber-600 hover:bg-amber-700 shadow-[0_0_10px_rgba(245,158,11,0.3)]'
                            : selectedVersion === 'v4'
                                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                : 'bg-indigo-600 hover:bg-indigo-700 shadow-[0_0_10px_rgba(79,70,229,0.3)]'
                        }`}
                >
                    {isAiMapping
                        ? '⏱️ Processing...'
                        : selectedVersion === 'v5' ? '🔊 Run Echolocation (V5)'
                            : selectedVersion === 'v4' ? '🎯 Run Note-by-Note (V4)'
                                : '✨ Run AI Auto-Map (V3)'
                    }
                </Button>
            </div>
        </div>
    )
}

export default AnchorSidebar
