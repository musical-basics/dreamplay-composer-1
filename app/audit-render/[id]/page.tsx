'use client'

/**
 * Headless render page for Playwright screenshot capture.
 * Renders the score with VexFlow on a white background, no UI chrome.
 *
 * Query params:
 *   ?page=0       — which page of measures to render (default 0)
 *   ?per_page=8   — measures per page (default 8)
 *
 * Signals:
 *   data-render-ready="true"  — VexFlow render complete, safe to screenshot
 *   data-render-result="{}"   — JSON with measureXMap, measureWidthMap, systemYMap
 *   data-status="..."         — Current status for debugging
 */

import * as React from 'react'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { parseMusicXml } from '@/lib/score/MusicXmlParser'
import type { IntermediateScore } from '@/lib/score/IntermediateScore'
import { VexFlowRenderer, type VexFlowRenderResult } from '@/components/score/VexFlowRenderer'
import { fetchConfigById } from '@/app/actions/config'

export default function AuditRenderPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const configId = params?.id as string
    const pageNum = parseInt(searchParams.get('page') ?? '0')
    const perPage = parseInt(searchParams.get('per_page') ?? '8')

    const [score, setScore] = useState<IntermediateScore | null>(null)
    const [status, setStatus] = useState('loading')
    const containerRef = useRef<HTMLDivElement>(null)

    // Load and parse score
    useEffect(() => {
        async function load() {
            console.log('[AUDIT-RENDER] Loading config:', configId)
            setStatus('fetching-config')
            try {
                const cfg = await fetchConfigById(configId)
                if (!cfg) {
                    console.error('[AUDIT-RENDER] Config not found')
                    setStatus('error-no-config')
                    return
                }
                if (!cfg.xml_url) {
                    console.error('[AUDIT-RENDER] No xml_url in config')
                    setStatus('error-no-xml')
                    return
                }
                console.log('[AUDIT-RENDER] Parsing MusicXML:', cfg.xml_url)
                setStatus('parsing-xml')
                const parsed = await parseMusicXml(cfg.xml_url)
                console.log('[AUDIT-RENDER] Parsed', parsed.measures.length, 'measures')
                setScore(parsed)
                setStatus('rendering')
            } catch (err) {
                console.error('[AUDIT-RENDER] Load failed:', err)
                setStatus(`error: ${err instanceof Error ? err.message : 'unknown'}`)
            }
        }
        load()
    }, [configId])

    // Paginate
    const paginatedScore = useMemo<IntermediateScore | null>(() => {
        if (!score) return null
        const start = pageNum * perPage
        const end = Math.min(start + perPage, score.measures.length)
        const slice = score.measures.slice(start, end)
        console.log('[AUDIT-RENDER] Paginated: page', pageNum, 'measures', start + 1, '-', start + slice.length)
        return { title: score.title, measures: slice }
    }, [score, pageNum, perPage])

    // When render completes, signal ready
    const handleRenderComplete = useCallback((result: VexFlowRenderResult) => {
        console.log('[AUDIT-RENDER] onRenderComplete fired! measureCount:', result.measureCount,
            'measureXMap keys:', [...result.measureXMap.keys()])
        setStatus('ready')

        if (containerRef.current) {
            const data = {
                measureXMap: Object.fromEntries(result.measureXMap),
                measureWidthMap: Object.fromEntries(result.measureWidthMap),
                systemYMap: result.systemYMap,
                measureCount: result.measureCount,
            }
            containerRef.current.setAttribute('data-render-result', JSON.stringify(data))
            containerRef.current.setAttribute('data-render-ready', 'true')
            console.log('[AUDIT-RENDER] Set data-render-ready=true')
        } else {
            console.error('[AUDIT-RENDER] containerRef is null!')
        }
    }, [])

    return (
        <div
            ref={containerRef}
            style={{ background: 'white', padding: 0, margin: 0 }}
            data-render-ready="false"
            data-status={status}
        >
            {/* Debug status visible in the page */}
            <div style={{ position: 'fixed', top: 0, right: 0, background: '#333', color: '#fff', padding: '4px 8px', fontSize: '10px', zIndex: 9999 }}>
                {status}
            </div>

            {paginatedScore ? (
                <VexFlowRenderer
                    score={paginatedScore}
                    musicFont="Bravura"
                    onRenderComplete={handleRenderComplete}
                />
            ) : (
                <div style={{ padding: 20, color: '#999' }}>
                    {status === 'loading' || status === 'fetching-config' || status === 'parsing-xml'
                        ? 'Loading score...'
                        : `Status: ${status}`
                    }
                </div>
            )}
        </div>
    )
}
