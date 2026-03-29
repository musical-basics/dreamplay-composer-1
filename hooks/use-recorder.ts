'use client'

import * as React from 'react'
import { useRef, useEffect } from 'react'

interface UseRecorderReturn {
    isRecording: boolean
    startRecording: () => Promise<void>
    stopRecording: () => Promise<File | null>
}

export function useRecorder(): UseRecorderReturn {
    const [isRecording, setIsRecording] = React.useState(false)
    const mediaRecorderRef = useRef<MediaRecorder | null>(null)
    const chunksRef = useRef<Blob[]>([])
    const streamRef = useRef<MediaStream | null>(null)

    const startRecording = async () => {
        try {
            // Add studio-mode class to hide UI
            document.body.classList.add('studio-mode')

            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: true,
            })
            streamRef.current = stream

            const recorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9',
            })

            chunksRef.current = []

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    chunksRef.current.push(e.data)
                }
            }

            mediaRecorderRef.current = recorder
            recorder.start()
            setIsRecording(true)
        } catch (err) {
            document.body.classList.remove('studio-mode')
            console.error('[Recorder] Failed to start:', err)
        }
    }

    const stopRecording = async (): Promise<File | null> => {
        return new Promise((resolve) => {
            const recorder = mediaRecorderRef.current
            if (!recorder) {
                resolve(null)
                return
            }

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'video/webm' })
                const file = new File([blob], `recording-${Date.now()}.webm`, {
                    type: 'video/webm',
                })

                // Clean up
                document.body.classList.remove('studio-mode')
                streamRef.current?.getTracks().forEach((t) => t.stop())
                streamRef.current = null
                mediaRecorderRef.current = null
                chunksRef.current = []
                setIsRecording(false)

                resolve(file)
            }

            recorder.stop()
        })
    }

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            document.body.classList.remove('studio-mode')
            streamRef.current?.getTracks().forEach((t) => t.stop())
        }
    }, [])

    return { isRecording, startRecording, stopRecording }
}
