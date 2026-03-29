'use client'

import * as React from 'react'
import { useState, useEffect } from 'react'
import { FileAudio, FileMusic, Music, CheckCircle2, ArrowRight, Upload, Loader2, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { SongConfig } from '@/lib/types'

interface UploadWizardProps {
    config: SongConfig
    onUploadAudio: (file: File) => Promise<void>
    onUploadXml: (file: File) => Promise<void>
    onUploadMidi: (file: File) => Promise<void>
}

export function UploadWizard({
    config,
    onUploadAudio,
    onUploadXml,
    onUploadMidi
}: UploadWizardProps) {
    const [uploading, setUploading] = useState<string | null>(null)

    // Determine current step based on config
    const hasAudio = !!config.audio_url
    const hasXml = !!config.xml_url
    const hasMidi = !!config.midi_url

    let currentStep = 1
    if (hasAudio) currentStep = 2
    if (hasAudio && hasXml) currentStep = 3
    if (hasAudio && hasXml && hasMidi) currentStep = 4

    const progress = (currentStep - 1) * 33.33

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'audio' | 'xml' | 'midi') => {
        const file = e.target.files?.[0]
        if (!file) return

        setUploading(type)
        try {
            if (type === 'audio') await onUploadAudio(file)
            if (type === 'xml') await onUploadXml(file)
            if (type === 'midi') await onUploadMidi(file)
        } catch (err) {
            console.error(`Upload failed for ${type}:`, err)
        } finally {
            setUploading(null)
            e.target.value = ''
        }
    }

    const StepIcon = ({ step, active, completed }: { step: number, active: boolean, completed: boolean }) => {
        if (completed) return <CheckCircle2 className="w-6 h-6 text-green-500" />
        return (
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${active ? 'bg-purple-600 text-white' : 'bg-zinc-800 text-zinc-500'}`}>
                {step}
            </div>
        )
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto w-full p-8">
            <div className="w-full mb-12 text-center">
                <h2 className="text-3xl font-bold text-white mb-2">Configure Your Song</h2>
                <p className="text-zinc-400">Follow the steps below to prepare your sheet music and audio.</p>
            </div>

            <div className="w-full space-y-8">
                {/* Progress Bar */}
                <div className="space-y-2">
                    <div className="flex justify-between text-xs font-medium text-zinc-500 uppercase tracking-wider">
                        <span>Progress</span>
                        <span>{Math.round(progress)}% Complete</span>
                    </div>
                    <Progress value={progress} className="h-2 bg-zinc-800" />
                </div>

                {/* Steps List */}
                <div className="grid grid-cols-1 gap-4">
                    {/* Step 1: Audio */}
                    <div className={`p-6 rounded-xl border transition-all ${currentStep === 1 ? 'bg-zinc-900 border-purple-500/50 shadow-lg shadow-purple-500/5' : 'bg-zinc-900/50 border-zinc-800 opacity-60'}`}>
                        <div className="flex items-start gap-4">
                            <StepIcon step={1} active={currentStep === 1} completed={hasAudio} />
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-white mb-1">Master Audio (WAV/MP3)</h3>
                                <p className="text-sm text-zinc-400 mb-4">Upload the primary audio file that will be mapped and synced.</p>
                                
                                {currentStep === 1 && (
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            onChange={(e) => handleFileChange(e, 'audio')}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={uploading !== null}
                                        />
                                        <Button className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 h-16 flex flex-col gap-1 items-center justify-center">
                                            {uploading === 'audio' ? (
                                                <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                                            ) : (
                                                <>
                                                    <FileAudio className="w-6 h-6 text-purple-400" />
                                                    <span className="text-xs">Click or drag to upload audio</span>
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Step 2: MusicXML */}
                    <div className={`p-6 rounded-xl border transition-all ${currentStep === 2 ? 'bg-zinc-900 border-purple-500/50 shadow-lg shadow-purple-500/5' : 'bg-zinc-900/50 border-zinc-800 ' + (currentStep < 2 ? 'opacity-40' : 'opacity-60')}`}>
                        <div className="flex items-start gap-4">
                            <StepIcon step={2} active={currentStep === 2} completed={hasXml} />
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-white mb-1">Sheet Music (MusicXML)</h3>
                                <p className="text-sm text-zinc-400 mb-4">Upload the XML file exported from Sibelius, Finale, or MuseScore.</p>
                                
                                {currentStep === 2 && (
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept=".xml,.musicxml,.mxl"
                                            onChange={(e) => handleFileChange(e, 'xml')}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={uploading !== null}
                                        />
                                        <Button className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 h-16 flex flex-col gap-1 items-center justify-center">
                                            {uploading === 'xml' ? (
                                                <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                                            ) : (
                                                <>
                                                    <FileMusic className="w-6 h-6 text-blue-400" />
                                                    <span className="text-xs">Click or drag to upload MusicXML</span>
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Step 3: MIDI */}
                    <div className={`p-6 rounded-xl border transition-all ${currentStep === 3 ? 'bg-zinc-900 border-purple-500/50 shadow-lg shadow-purple-500/5' : 'bg-zinc-900/50 border-zinc-800 ' + (currentStep < 3 ? 'opacity-40' : 'opacity-60')}`}>
                        <div className="flex items-start gap-4">
                            <StepIcon step={3} active={currentStep === 3} completed={hasMidi} />
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold text-white mb-1">Performance (MIDI)</h3>
                                <p className="text-sm text-zinc-400 mb-4">Upload the MIDI file corresponding to the performance.</p>
                                
                                {currentStep === 3 && (
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept=".mid,.midi"
                                            onChange={(e) => handleFileChange(e, 'midi')}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={uploading !== null}
                                        />
                                        <Button className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700 h-16 flex flex-col gap-1 items-center justify-center">
                                            {uploading === 'midi' ? (
                                                <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                                            ) : (
                                                <>
                                                    <Music className="w-6 h-6 text-amber-400" />
                                                    <span className="text-xs">Click or drag to upload MIDI</span>
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {hasAudio && hasXml && hasMidi && (
                    <div className="p-6 rounded-xl border border-green-500/30 bg-green-500/5 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">All Files Ready!</h3>
                        <p className="text-zinc-400 mb-6">You've successfully uploaded all necessary assets. You can now start mapping the score.</p>
                        <div className="flex flex-col gap-3">
                            <Button className="w-full bg-green-600 hover:bg-green-700 text-white py-6 text-lg font-bold shadow-lg shadow-green-500/20" onClick={() => window.location.reload()}>
                                Enter Editor <ArrowRight className="w-5 h-5 ml-2" />
                            </Button>
                            <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                                <Info className="w-3 h-3" />
                                <span>Note: Full interface will be unlocked.</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
