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
    rootCause: 'musicxml-parse' | 'vexflow-render' | 'normalization' | 'musicxml-source' | 'unknown'
    rootCauseExplanation: string
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

const AUDIT_SYSTEM_PROMPT = `You are a music notation rendering engineer debugging a VexFlow-based sheet music renderer. You understand MusicXML parsing, VexFlow's API, and music engraving conventions.

You will be shown two images of the same measure of music:
1. REFERENCE — the correct rendering (from Sibelius, Finale, or a published edition)
2. RENDERED — our VexFlow web renderer's output, which may have bugs

Your job is NOT to describe surface-level differences. Your job is to DIAGNOSE WHY each difference exists and suggest SYSTEMIC fixes. Every issue falls into one of these root causes:

- **musicxml-parse**: Our MusicXML parser (MusicXmlParser.ts) is misreading or ignoring data from the XML. For example: not parsing a clef change, dropping an articulation, misinterpreting voice assignments, wrong beat calculation.
- **vexflow-render**: The parser reads the data correctly, but our VexFlow rendering code (VexFlowRenderer.tsx, VexFlowHelpers.ts) applies it incorrectly. For example: wrong articulation placement logic, beam grouping algorithm bug, stem direction override issue.
- **normalization**: Our MusicXML preprocessing pipeline (normalizeMusicXml.ts) should be fixing this but isn't. For example: articulation placement attributes missing from the source XML.
- **musicxml-source**: The original MusicXML file itself is wrong or incomplete (exported incorrectly from Sibelius/Finale). This is NOT a bug in our code.

IMPORTANT RULES:
- Do NOT suggest one-off fixes like "add a clef to measure 5" — suggest fixes to the PARSER or RENDERER that would fix this class of issue everywhere.
- Do NOT flag cosmetic spacing differences unless they cause readability issues.
- DO explain your reasoning for the root cause. WHY do you think the parser is dropping this element vs the renderer misplacing it?
- If a clef/key/time signature is missing, ask: is the parser not emitting it, or is the renderer not drawing it?
- If notes look wrong, ask: is the pitch/duration parsed correctly but rendered wrong, or parsed wrong in the first place?

Respond with ONLY a JSON object:
{
    "findings": [
        {
            "id": "f1",
            "category": "articulation|accidental|stem|beam|slur|tie|spacing|clef|key-signature|time-signature|dynamics|rest|note-position|missing-element|extra-element|other",
            "severity": "critical|major|minor|cosmetic",
            "measure": 1,
            "beat": 2.5,
            "staff": "treble|bass|both|null",
            "description": "What is wrong",
            "expected": "What the reference shows",
            "actual": "What the render shows",
            "rootCause": "musicxml-parse|vexflow-render|normalization|musicxml-source|unknown",
            "rootCauseExplanation": "WHY this is happening — your diagnosis of which layer is broken and why",
            "suggestedFix": "Specific systemic fix: which file to change, what logic to add/modify. Must fix the class of issue, not just this one measure."
        }
    ],
    "summary": "1-2 sentence diagnosis of the overall rendering quality for this measure"
}

If no meaningful discrepancies exist, return an empty findings array.`

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

/**
 * Save audit results as a markdown file for IDE AI consumption.
 * Saved to docs/audit-references/<configId>/m<N>_improvements.md
 */
export async function saveAuditResultMarkdown(
    configId: string,
    measureNum: number,
    result: AuditResult,
): Promise<void> {
    const dir = path.join(REFS_DIR, configId)
    await fs.mkdir(dir, { recursive: true })

    const lines: string[] = [
        `# Measure ${measureNum} — Audit Results`,
        '',
        `> Model: ${result.modelUsed}`,
        `> Generated: ${new Date().toISOString()}`,
        '',
        `## Summary`,
        '',
        result.summary,
        '',
    ]

    if (result.findings.length === 0) {
        lines.push('No issues found.', '')
    } else {
        const severityCounts = { critical: 0, major: 0, minor: 0, cosmetic: 0 }
        result.findings.forEach(f => { severityCounts[f.severity]++ })
        const countsStr = Object.entries(severityCounts).filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(', ')
        lines.push(`**Issues:** ${countsStr}`, '')

        for (const f of result.findings) {
            lines.push(
                `---`,
                '',
                `### ${f.id}: ${f.description}`,
                '',
                `- **Category:** ${f.category}`,
                `- **Severity:** ${f.severity}`,
                `- **Staff:** ${f.staff ?? '—'}`,
                `- **Beat:** ${f.beat ?? '—'}`,
                '',
                `**Expected:** ${f.expected}`,
                '',
                `**Actual:** ${f.actual}`,
                '',
                `**Root Cause:** \`${f.rootCause}\``,
                '',
                f.rootCauseExplanation,
                '',
                `**Systemic Fix:**`,
                '',
                f.suggestedFix,
                '',
            )
        }
    }

    const filePath = path.join(dir, `m${measureNum}_improvements.md`)
    await fs.writeFile(filePath, lines.join('\n'), 'utf-8')
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

export async function loadAllRenderCaptures(
    configId: string,
): Promise<Map<number, string>> {
    const dir = path.join(REFS_DIR, configId)
    const map = new Map<number, string>()
    try {
        const files = await fs.readdir(dir)
        for (const file of files) {
            const match = file.match(/^m(\d+)_render\.png$/)
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
