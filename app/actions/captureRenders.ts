'use server'

/**
 * Server Action: Capture a single measure render using Playwright.
 * Launches headless Chromium, navigates to the audit-render page for
 * the page containing that measure, screenshots just that measure.
 */

import { chromium } from 'playwright'
import { promises as fs } from 'fs'
import path from 'path'

const REFS_DIR = path.join(process.cwd(), 'docs', 'audit-references')
const MEASURES_PER_PAGE = 8

/**
 * Capture a single measure's render via Playwright.
 * Returns the base64 PNG data URL.
 */
export async function captureMeasureRender(
    configId: string,
    measureNum: number,
    baseUrl: string,
): Promise<{ dataUrl: string } | { error: string }> {
    const dir = path.join(REFS_DIR, configId)
    await fs.mkdir(dir, { recursive: true })

    const pageNum = Math.floor((measureNum - 1) / MEASURES_PER_PAGE)
    const url = `${baseUrl}/audit-render/${configId}?page=${pageNum}&per_page=${MEASURES_PER_PAGE}`

    const browser = await chromium.launch({ headless: true })

    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            deviceScaleFactor: 2,
        })
        const page = await context.newPage()

        await page.goto(url, { waitUntil: 'networkidle' })
        await page.waitForSelector('[data-render-ready="true"]', { timeout: 15000 })
        await page.waitForTimeout(500) // font settling

        const renderData = await page.evaluate(() => {
            const el = document.querySelector('[data-render-result]')
            if (!el) return null
            return JSON.parse(el.getAttribute('data-render-result') || '{}')
        })

        if (!renderData?.measureXMap) {
            return { error: 'No render data from page' }
        }

        const x = renderData.measureXMap[String(measureNum)]
        const w = renderData.measureWidthMap[String(measureNum)]
        const systemY = renderData.systemYMap as { top: number; height: number }

        if (x === undefined || w === undefined) {
            return { error: `Measure ${measureNum} not found in render data` }
        }

        const padding = 8
        const filePath = path.join(dir, `m${measureNum}_render.png`)

        await page.screenshot({
            path: filePath,
            clip: {
                x: Math.max(0, x - padding),
                y: Math.max(0, systemY.top - padding),
                width: w + padding * 2,
                height: systemY.height + padding * 2,
            },
        })

        // Read back as data URL
        const data = await fs.readFile(filePath)
        const dataUrl = `data:image/png;base64,${data.toString('base64')}`

        await context.close()
        return { dataUrl }
    } catch (err) {
        return { error: err instanceof Error ? err.message : 'Capture failed' }
    } finally {
        await browser.close()
    }
}
