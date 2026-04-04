'use server'

/**
 * Server Action: Capture a single measure render using Playwright.
 */

import { chromium } from 'playwright'
import { promises as fs } from 'fs'
import path from 'path'

const REFS_DIR = path.join(process.cwd(), 'docs', 'audit-references')
const MEASURES_PER_PAGE = 8

export async function captureMeasureRender(
    configId: string,
    measureNum: number,
    baseUrl: string,
): Promise<{ dataUrl: string } | { error: string }> {
    const dir = path.join(REFS_DIR, configId)
    await fs.mkdir(dir, { recursive: true })

    const pageNum = Math.floor((measureNum - 1) / MEASURES_PER_PAGE)
    const url = `${baseUrl}/audit-render/${configId}?page=${pageNum}&per_page=${MEASURES_PER_PAGE}`

    console.log(`[PLAYWRIGHT] Capturing M${measureNum}: ${url}`)

    let browser
    try {
        browser = await chromium.launch({ headless: true })
        console.log('[PLAYWRIGHT] Browser launched')
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown'
        console.error('[PLAYWRIGHT] Failed to launch browser:', msg)
        return { error: `Browser launch failed: ${msg}` }
    }

    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            deviceScaleFactor: 2,
        })
        const page = await context.newPage()

        // Log console messages from the render page
        page.on('console', msg => {
            console.log(`[PLAYWRIGHT:PAGE] ${msg.type()}: ${msg.text()}`)
        })
        page.on('pageerror', err => {
            console.error(`[PLAYWRIGHT:PAGE] Error: ${err.message}`)
        })

        console.log('[PLAYWRIGHT] Navigating to:', url)
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
        console.log('[PLAYWRIGHT] Page loaded (networkidle)')

        // Check current status
        const statusBefore = await page.getAttribute('[data-status]', 'data-status')
        console.log('[PLAYWRIGHT] data-status:', statusBefore)

        const readyBefore = await page.getAttribute('[data-render-ready]', 'data-render-ready')
        console.log('[PLAYWRIGHT] data-render-ready:', readyBefore)

        // Wait for render ready — with better timeout message
        console.log('[PLAYWRIGHT] Waiting for data-render-ready="true"...')
        try {
            await page.waitForSelector('[data-render-ready="true"]', { timeout: 30000 })
        } catch {
            // Grab final status for debugging
            const statusAfter = await page.getAttribute('[data-status]', 'data-status').catch(() => 'unknown')
            const readyAfter = await page.getAttribute('[data-render-ready]', 'data-render-ready').catch(() => 'unknown')
            const errorMsg = `Timeout waiting for render. Status: ${statusAfter}, Ready: ${readyAfter}`
            console.error(`[PLAYWRIGHT] ${errorMsg}`)

            // Take a debug screenshot
            const debugPath = path.join(dir, `m${measureNum}_debug.png`)
            await page.screenshot({ path: debugPath, fullPage: true }).catch(() => {})
            console.log(`[PLAYWRIGHT] Debug screenshot saved to ${debugPath}`)

            await context.close()
            return { error: errorMsg }
        }

        console.log('[PLAYWRIGHT] Render ready! Waiting 500ms for font settling...')
        await page.waitForTimeout(500)

        // Read render data
        const renderData = await page.evaluate(() => {
            const el = document.querySelector('[data-render-result]')
            if (!el) return null
            return JSON.parse(el.getAttribute('data-render-result') || '{}')
        })

        if (!renderData?.measureXMap) {
            console.error('[PLAYWRIGHT] No render data found')
            await context.close()
            return { error: 'No render data from page' }
        }

        const x = renderData.measureXMap[String(measureNum)]
        const w = renderData.measureWidthMap[String(measureNum)]
        const systemY = renderData.systemYMap as { top: number; height: number }

        if (x === undefined || w === undefined) {
            console.error(`[PLAYWRIGHT] M${measureNum} not in render data. Available:`, Object.keys(renderData.measureXMap))
            await context.close()
            return { error: `Measure ${measureNum} not found in render data` }
        }

        const padding = 8
        const clip = {
            x: Math.max(0, x - padding),
            y: Math.max(0, systemY.top - padding),
            width: w + padding * 2,
            height: systemY.height + padding * 2,
        }
        console.log(`[PLAYWRIGHT] Clipping M${measureNum}:`, clip)

        const filePath = path.join(dir, `m${measureNum}_render.png`)
        await page.screenshot({ path: filePath, clip })
        console.log(`[PLAYWRIGHT] Saved: ${filePath}`)

        const data = await fs.readFile(filePath)
        const dataUrl = `data:image/png;base64,${data.toString('base64')}`

        await context.close()
        console.log(`[PLAYWRIGHT] M${measureNum} capture complete`)
        return { dataUrl }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'unknown'
        console.error(`[PLAYWRIGHT] Capture failed: ${msg}`)
        return { error: msg }
    } finally {
        await browser.close()
    }
}
