'use client'

import * as React from 'react'
import { useState } from 'react'
import { Trash2, ChevronDown, Wand2, Layers, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import type { Anchor, BeatAnchor, V5MapperState } from '@/lib/types'

interface AnchorSidebarProps {
    anchors: Anchor[]
    beatAnchors?: BeatAnchor[]
    currentMeasure: number
    totalMeasures: number
    isLevel2Mode: boolean
    darkMode?: boolean
    onSetAnchor: (measure: number, time: number) => void
    onDeleteAnchor: (measure: number) => void
    onToggleLevel2: (enabled: boolean) => void
    onSetBeatAnchor?: (measure: number, beat: number, time: number) => void
    onTap?: () => void
    onClearAll?: () => void
    onAutoMap?: (chordThresholdFraction: number) => void
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
    darkMode = false,
    onSetAnchor,
    onDeleteAnchor,
    onToggleLevel2,
    onSetBeatAnchor,
    onTap,
    onClearAll,
    onAutoMap,
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

            <Accordion type="single" collapsible className="border-b border-zinc-800">
                <AccordionItem value="advanced" className="border-none">
                    <AccordionTrigger className="px-3 py-2 text-[10px] uppercase font-bold text-zinc-500 hover:no-underline hover:text-zinc-300">
                        <div className="flex items-center gap-2">
                            <Settings2 className="w-3 h-3" />
                            Advanced Mapping Tools
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-4 space-y-4">
                        {/* L2 Toggle */}
                        <div className="flex items-center space-x-2 bg-zinc-800/30 p-2 rounded-lg border border-zinc-800/50">
                            <Checkbox
                                id="l2-mode"
                                checked={isLevel2Mode}
                                onCheckedChange={(checked) => onToggleLevel2(!!checked)}
                            />
                            <Label
                                htmlFor="l2-mode"
                                className="text-xs font-medium leading-none cursor-pointer text-zinc-300"
                            >
                                View Beat-level mapping (L2)
                            </Label>
                        </div>

                        <div className="h-px bg-zinc-800 my-2" />

                        <V5Controls
                            darkMode={darkMode}
                            border={border}
                            currentMeasure={currentMeasure}
                            isAiMapping={isAiMapping}
                            v5State={v5State}
                            onClearAll={onClearAll}
                            onTap={onTap}
                            onAutoMap={onAutoMap}
                            onConfirmGhost={onConfirmGhost}
                            onProceedMapping={onProceedMapping}
                            onRunV5ToEnd={onRunV5ToEnd}
                            onUpdateGhostTime={onUpdateGhostTime}
                        />
                    </AccordionContent>
                </AccordionItem>
            </Accordion>

            <div className="flex-1 overflow-y-auto p-2">
                {rows}
            </div>

            <div className={`p-3 border-t border-zinc-800 bg-zinc-900/50 flex flex-col gap-2 shrink-0`}>
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Quick Actions</span>
                    <span className="text-[10px] font-mono text-zinc-400">M{currentMeasure}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" size="sm" onClick={onClearAll}
                        className="text-[10px] font-bold h-8 border-zinc-700 hover:bg-zinc-800 text-zinc-400">
                        Clear All
                    </Button>
                    <Button size="sm" onClick={onTap}
                        className="bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold h-8 shadow-lg shadow-purple-500/20">
                        TAP (A)
                    </Button>
                </div>
            </div>
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
    onAutoMap?: (chordThresholdFraction: number) => void
    onConfirmGhost?: () => void
    onProceedMapping?: () => void
    onRunV5ToEnd?: () => void
    onUpdateGhostTime?: (time: number) => void
}

const V5Controls: React.FC<V5ControlsProps> = ({
    darkMode, border, currentMeasure, isAiMapping, v5State,
    onClearAll, onTap, onAutoMap,
    onConfirmGhost, onProceedMapping, onRunV5ToEnd, onUpdateGhostTime,
}) => {
    const [chordThreshold, setChordThreshold] = useState<number>(0.0625) // 64th note default
    const isV5Active = v5State && (v5State.status === 'running' || v5State.status === 'paused')

    return (
        <div className="flex flex-col gap-4">
            <div className="space-y-2">
                {!isV5Active && (
                    <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                        <Label className="text-[10px] uppercase font-bold text-zinc-500">Mapping Sensitivity</Label>
                        <select
                            value={chordThreshold}
                            onChange={(e) => setChordThreshold(Number(e.target.value))}
                            className={`w-full text-xs px-2 py-1.5 rounded ${darkMode ? 'bg-zinc-900 border-zinc-700 text-white' : 'bg-zinc-100 border-zinc-200'
                                } border focus:outline-none focus:ring-1 focus:ring-purple-500/50`}
                        >
                            <option value={0.0625}>Strict (64th note)</option>
                            <option value={0.125}>Standard (32nd note)</option>
                            <option value={0.25}>Loose (16th note)</option>
                        </select>
                    </div>
                )}
            </div>

            {/* AI Control Button */}
            <Button
                size="sm"
                onClick={() => onAutoMap?.(chordThreshold)}
                disabled={isAiMapping || !!isV5Active}
                className="w-full text-[11px] font-bold h-9 transition-all disabled:opacity-50 bg-amber-600 hover:bg-amber-700 shadow-md shadow-amber-500/20 text-white"
            >
                {isAiMapping
                    ? 'Processing...'
                    : (
                        <div className="flex items-center gap-2">
                            <Wand2 className="w-3.5 h-3.5" />
                            Auto-Map Performance
                        </div>
                    )
                }
            </Button>

            {/* V5 Paused State: Ghost Anchor Controls */}
            {v5State?.status === 'paused' && v5State.ghostAnchor && (
                <div className="space-y-3 p-3 rounded-lg border border-orange-500/30 bg-orange-500/5 animate-in zoom-in-95 duration-200">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-orange-400 uppercase">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-orange-500"></span>
                        </span>
                        Manual Intervention Required
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                        <Label className="text-[10px] text-orange-500/70 font-bold uppercase">M{v5State.ghostAnchor.measure} B{v5State.ghostAnchor.beat} Time (s)</Label>
                        <input
                            type="number"
                            step="0.001"
                            value={v5State.ghostAnchor.time.toFixed(3)}
                            onChange={(e) => onUpdateGhostTime?.(parseFloat(e.target.value) || 0)}
                            className="w-full px-2 py-1.5 rounded font-mono text-xs border bg-zinc-900 border-orange-500/50 text-orange-400 focus:outline-none"
                        />
                    </div>

                    <div className="flex gap-2">
                        <Button size="sm" onClick={onConfirmGhost}
                            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold h-7">
                            Confirm
                        </Button>
                        <Button size="sm" onClick={onProceedMapping}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold h-7">
                            Skip
                        </Button>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onRunV5ToEnd}
                        className="w-full text-[10px] font-bold h-7 text-zinc-500 hover:text-white hover:bg-zinc-800">
                        Auto-confirm to end
                    </Button>
                </div>
            )}

            {/* V5 Running/Done Info */}
            {(v5State?.status === 'running' || v5State?.status === 'done') && (
                <div className={`text-center py-2 px-3 rounded-lg border animate-in fade-in duration-300 ${
                    v5State.status === 'done' 
                        ? 'bg-green-500/10 border-green-500/20 text-green-400' 
                        : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                }`}>
                    <div className="text-[10px] font-bold uppercase tracking-tight">
                        {v5State.status === 'done' ? 'Mapping Complete' : 'Calculating Local Tempo...'}
                    </div>
                    <div className="text-[9px] opacity-70 mt-0.5">
                        {v5State.status === 'done' 
                            ? `${v5State.anchors.length} anchors | ${v5State.beatAnchors.length} beats`
                            : `Event ${v5State.currentEventIndex} | BPM: ${(60 / v5State.aqntl).toFixed(0)}`
                        }
                    </div>
                </div>
            )}
        </div>
    )
}

export default AnchorSidebar
