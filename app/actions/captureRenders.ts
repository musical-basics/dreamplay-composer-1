'use server'

/**
 * Server Action: Capture measure renders using Playwright.
 * Launches a headless browser, navigates to the audit-render page,
 * waits for VexFlow to finish rendering, then screenshots each measure.
 */

import { chromium } from 'playwright'
import { promises as fs } from 'fs'
import path from 'path'

const REFS_DIR = path.join(process.cwd(), 'docs', 'audit-references')
const MEASURES_PER_PAGE = 8

/**
 * Capture all measures for a given config using Playwright.
 * Screenshots are saved to docs/audit-references/<configId>/m<N>_render.png
 *
 * @param configId - The song config ID
 * @param totalMeasures - Total number of measures in the score
 * @param baseUrl - The app's base URL (e.g., http://localhost:3000)
 * @returns Map of measure number → base64 PNG data URL
 */
export async function captureAllRendersWithPlaywright(
    configId: string,
    totalMeasures: number,
    baseUrl: string,
): Promise<{ captured: number; errors: string[] }> {
    const dir = path.join(REFS_DIR, configId)
    await fs.mkdir(dir, { recursive: true })

    const totalPages = Math.ceil(totalMeasures / MEASURES_PER_PAGE)
    let captured = 0
    const errors: string[] = []

    const browser = await chromium.launch({ headless: true })

    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            deviceScaleFactor: 2, // retina
        })
        const page = await context.newPage()

        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
            const url = `${baseUrl}/audit-render/${configId}?page=${pageNum}&per_page=${MEASURES_PER_PAGE}`

            try {
                await page.goto(url, { waitUntil: 'networkidle' })

                // Wait for VexFlow to signal render complete
                await page.waitForSelector('[data-render-ready="true"]', { timeout: 15000 })

                // Extra wait for font settling (SMuFL PUA glyph shaping)
                await page.waitForTimeout(500)

                // Read the render result data
                const renderData = await page.evaluate(() => {
                    const el = document.querySelector('[data-render-result]')
                    if (!el) return null
                    return JSON.parse(el.getAttribute('data-render-result') || '{}')
                })

                if (!renderData?.measureXMap) {
                    errors.push(`Page ${pageNum}: No render data`)
                    continue
                }

                const measureXMap = renderData.measureXMap as Record<string, number>
                const measureWidthMap = renderData.measureWidthMap as Record<string, number>
                const systemY = renderData.systemYMap as { top: number; height: number }
                const padding = 8

                // Screenshot each measure by clipping
                for (const [measureNumStr, x] of Object.entries(measureXMap)) {
                    const measureNum = parseInt(measureNumStr)
                    const w = measureWidthMap[measureNumStr]
                    if (w === undefined) continue

                    const clipX = Math.max(0, x - padding)
                    const clipY = Math.max(0, systemY.top - padding)
                    const clipW = w + padding * 2
                    const clipH = systemY.height + padding * 2

                    const filePath = path.join(dir, `m${measureNum}_render.png`)

                    try {
                        await page.screenshot({
                            path: filePath,
                            clip: { x: clipX, y: clipY, width: clipW, height: clipH },
                        })
                        captured++
                    } catch (err) {
                        errors.push(`M${measureNum}: ${err instanceof Error ? err.message : 'screenshot failed'}`)
                    }
                }
            } catch (err) {
                errors.push(`Page ${pageNum}: ${err instanceof Error ? err.message : 'failed'}`)
            }
        }

        await context.close()
    } finally {
        await browser.close()
    }

    return { captured, errors }
}
