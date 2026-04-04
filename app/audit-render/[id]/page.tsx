'use client'

/**
 * Headless render page for Playwright screenshot capture.
 * Renders the full score with VexFlow on a white background,
 * no UI chrome — just the music notation.
 *
 * Query params:
 *   ?page=0       — which page of measures to render (default 0)
 *   ?per_page=8   — measures per page (default 8)
 *
 * When rendering is complete, sets data-render-ready="true" on the
 * container div so Playwright knows when to screenshot.
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
    const [renderResult, setRenderResult] = useState<VexFlowRenderResult | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Load and parse score
    useEffect(() => {
        async function load() {
            const cfg = await fetchConfigById(configId)
            if (cfg?.xml_url) {
                const parsed = await parseMusicXml(cfg.xml_url)
                setScore(parsed)
            }
        }
        load()
    }, [configId])

    // Paginate
    const paginatedScore = useMemo<IntermediateScore | null>(() => {
        if (!score) return null
        const start = pageNum * perPage
        const end = Math.min(start + perPage, score.measures.length)
        return { title: score.title, measures: score.measures.slice(start, end) }
    }, [score, pageNum, perPage])

    // When render completes, signal ready for Playwright
    const handleRenderComplete = useCallback((result: VexFlowRenderResult) => {
        setRenderResult(result)
        // Encode render result as JSON in a data attribute for Playwright to read
        if (containerRef.current) {
            const data = {
                measureXMap: Object.fromEntries(result.measureXMap),
                measureWidthMap: Object.fromEntries(result.measureWidthMap),
                systemYMap: result.systemYMap,
                measureCount: result.measureCount,
            }
            containerRef.current.setAttribute('data-render-result', JSON.stringify(data))
            containerRef.current.setAttribute('data-render-ready', 'true')
        }
    }, [])

    return (
        <div
            ref={containerRef}
            style={{ background: 'white', padding: 0, margin: 0 }}
            data-render-ready="false"
        >
            {paginatedScore && (
                <VexFlowRenderer
                    score={paginatedScore}
                    musicFont="Bravura"
                    onRenderComplete={handleRenderComplete}
                />
            )}
        </div>
    )
}
