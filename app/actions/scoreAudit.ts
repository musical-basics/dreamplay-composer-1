'use server'

/**
 * Server Action: Score Audit — uses Claude Vision to compare a VexFlow
 * render against a reference image and return structured discrepancies.
 */

import Anthropic from '@anthropic-ai/sdk'
import { promises as fs } from 'fs'
import path from 'path'

export type AuditFinding = {
    id: string
    category: 'articulation' | 'accidental' | 'stem' | 'beam' | 'slur' | 'tie' | 'spacing' | 'clef' | 'key-signature' | 'time-signature' | 'dynamics' | 'rest' | 'note-position' | 'missing-element' | 'extra-element' | 'other'
    severity: 'critical' | 'major' | 'minor' | 'cosmetic'
    measure: number | null
    beat: number | null
    staff: 'treble' | 'bass' | 'both' | null
    description: string
    expected: string
    actual: string
    suggestedFix: string
}

export type AuditResult = {
    findings: AuditFinding[]
    summary: string
    modelUsed: string
}

/** Fetch available Claude models that support vision */
const DEFAULT_MODELS = [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
]

export async function fetchAvailableModels(): Promise<{ id: string; name: string }[]> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return DEFAULT_MODELS

    try {
        const client = new Anthropic({ apiKey })
        const response = await client.models.list({ limit: 20 })

        const visionModels = response.data
            .filter(m => m.id.includes('claude'))
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map(m => ({ id: m.id, name: m.display_name }))

        return visionModels.length > 0 ? visionModels : DEFAULT_MODELS
    } catch {
        return DEFAULT_MODELS
    }
}

const AUDIT_SYSTEM_PROMPT = `You are a professional music engraver and sheet music proofreader. You will be shown two images:

1. A REFERENCE image — this is the correct, authoritative rendering of the sheet music (from a published edition or professional notation software).
2. A RENDERED image — this is a web-based VexFlow rendering of the same music that may contain errors.

Your job is to meticulously compare every visual element and identify discrepancies. Focus on:

- **Articulations**: staccato dots, tenuto marks, accents, fermatas — are they on the correct side of the note? (staccato/tenuto go on the notehead side: below for stem-up, above for stem-down)
- **Accidentals**: missing, extra, or wrong accidentals (sharps, flats, naturals)
- **Stem direction**: should stems go up or down?
- **Beaming**: are notes beamed correctly? Are beam groups correct for the time signature?
- **Slurs and ties**: missing, extra, or wrongly placed curves
- **Spacing**: notes too close, too far apart, or overlapping
- **Clefs and key/time signatures**: correct symbols in correct positions
- **Dynamics and expression marks**: missing or misplaced
- **Rest positions**: rests at correct vertical position
- **Note positions**: notes on correct staff lines/spaces
- **Missing or extra elements**: anything present in reference but absent in render, or vice versa

For each finding, determine:
- The measure number (count from left, starting at 1 for the first visible measure)
- The approximate beat position
- Which staff (treble/bass)
- Severity: critical (wrong notes/pitches), major (wrong articulations/accidentals), minor (spacing/positioning), cosmetic (visual polish)

Respond with ONLY a JSON object matching this exact schema:
{
    "findings": [
        {
            "id": "f1",
            "category": "articulation|accidental|stem|beam|slur|tie|spacing|clef|key-signature|time-signature|dynamics|rest|note-position|missing-element|extra-element|other",
            "severity": "critical|major|minor|cosmetic",
            "measure": 1,
            "beat": 2.5,
            "staff": "treble|bass|both|null",
            "description": "Clear description of the discrepancy",
            "expected": "What the reference shows",
            "actual": "What the render shows",
            "suggestedFix": "Technical suggestion for fixing in MusicXML or VexFlow renderer"
        }
    ],
    "summary": "Brief overall assessment (1-2 sentences)"
}

If no discrepancies are found, return an empty findings array with a summary saying the render matches the reference.`

export async function runScoreAudit(
    referenceImageBase64: string,
    renderedImageBase64: string,
    modelId: string,
    measureRange?: { start: number; end: number },
): Promise<AuditResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured. Add it to .env.local')
    }

    const client = new Anthropic({ apiKey })

    const userPrompt = measureRange
        ? `Compare these two score renderings. Focus on measures ${measureRange.start} through ${measureRange.end}. The first image is the REFERENCE (correct). The second image is the RENDERED output (may have errors).`
        : `Compare these two score renderings. The first image is the REFERENCE (correct). The second image is the RENDERED output (may have errors).`

    // Strip data URL prefix if present
    const cleanRef = referenceImageBase64.replace(/^data:image\/[^;]+;base64,/, '')
    const cleanRender = renderedImageBase64.replace(/^data:image\/[^;]+;base64,/, '')

    // Detect media type from data URL or default to png
    const refMediaType = referenceImageBase64.match(/^data:(image\/[^;]+);/)?.[1] as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' || 'image/png'
    const renderMediaType = renderedImageBase64.match(/^data:(image\/[^;]+);/)?.[1] as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' || 'image/png'

    const response = await client.messages.create({
        model: modelId,
        max_tokens: 8192,
        system: AUDIT_SYSTEM_PROMPT,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: refMediaType,
                            data: cleanRef,
                        },
                    },
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: renderMediaType,
                            data: cleanRender,
                        },
                    },
                    {
                        type: 'text',
                        text: userPrompt,
                    },
                ],
            },
        ],
    })

    // Extract text response
    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude')
    }

    // Parse JSON from response (handle markdown code fences)
    let jsonStr = textBlock.text.trim()
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) {
        jsonStr = fenceMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr) as { findings: AuditFinding[]; summary: string }

    return {
        findings: parsed.findings,
        summary: parsed.summary,
        modelUsed: modelId,
    }
}

// ─── Local Reference Storage ───────────────────────────────────────
// Saves reference images to docs/audit-references/<configId>/
// so they persist across sessions and are accessible to IDE AI tools.

const REFS_DIR = path.join(process.cwd(), 'docs', 'audit-references')

function getRefPath(configId: string, measureNum: number): string {
    return path.join(REFS_DIR, configId, `m${measureNum}.png`)
}

function getRenderPath(configId: string, measureNum: number): string {
    return path.join(REFS_DIR, configId, `m${measureNum}_render.png`)
}

export async function saveRenderCapture(
    configId: string,
    measureNum: number,
    base64DataUrl: string,
): Promise<void> {
    const dir = path.join(REFS_DIR, configId)
    await fs.mkdir(dir, { recursive: true })
    const raw = base64DataUrl.replace(/^data:image\/[^;]+;base64,/, '')
    await fs.writeFile(getRenderPath(configId, measureNum), raw, 'base64')
}

export async function saveReferenceImage(
    configId: string,
    measureNum: number,
    base64DataUrl: string,
): Promise<void> {
    const dir = path.join(REFS_DIR, configId)
    await fs.mkdir(dir, { recursive: true })

    // Strip data URL prefix → raw base64
    const raw = base64DataUrl.replace(/^data:image\/[^;]+;base64,/, '')
    await fs.writeFile(getRefPath(configId, measureNum), raw, 'base64')
}

export async function loadReferenceImage(
    configId: string,
    measureNum: number,
): Promise<string | null> {
    const filePath = getRefPath(configId, measureNum)
    try {
        const data = await fs.readFile(filePath)
        return `data:image/png;base64,${data.toString('base64')}`
    } catch {
        return null
    }
}

export async function loadAllReferenceImages(
    configId: string,
): Promise<Map<number, string>> {
    const dir = path.join(REFS_DIR, configId)
    const map = new Map<number, string>()
    try {
        const files = await fs.readdir(dir)
        for (const file of files) {
            const match = file.match(/^m(\d+)\.png$/)
            if (match) {
                const measureNum = parseInt(match[1])
                const data = await fs.readFile(path.join(dir, file))
                map.set(measureNum, `data:image/png;base64,${data.toString('base64')}`)
            }
        }
    } catch {
        // Directory doesn't exist yet
    }
    return map
}
