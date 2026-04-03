import { NextRequest, NextResponse } from 'next/server'

function parseHostFromDomain(domain: string | undefined): string | null {
    if (!domain) return null
    const normalized = domain.includes('://') ? domain : `https://${domain}`
    try {
        return new URL(normalized).hostname
    } catch {
        return null
    }
}

export async function GET(request: NextRequest) {
    const target = request.nextUrl.searchParams.get('url')
    if (!target) {
        return NextResponse.json({ error: 'Missing url query parameter' }, { status: 400 })
    }

    let parsedUrl: URL
    try {
        parsedUrl = new URL(target)
    } catch {
        return NextResponse.json({ error: 'Invalid url query parameter' }, { status: 400 })
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return NextResponse.json({ error: 'Only http and https URLs are allowed' }, { status: 400 })
    }

    const allowedHosts = new Set<string>([request.nextUrl.hostname])
    const r2Host = parseHostFromDomain(process.env.R2_PUBLIC_DOMAIN || process.env.VITE_R2_PUBLIC_DOMAIN)
    if (r2Host) allowedHosts.add(r2Host)

    if (!allowedHosts.has(parsedUrl.hostname)) {
        return NextResponse.json({ error: `Host is not allowed: ${parsedUrl.hostname}` }, { status: 403 })
    }

    try {
        const upstreamResponse = await fetch(parsedUrl.toString(), { cache: 'no-store' })
        if (!upstreamResponse.ok) {
            return NextResponse.json(
                { error: `Upstream fetch failed: ${upstreamResponse.status} ${upstreamResponse.statusText}` },
                { status: upstreamResponse.status },
            )
        }

        const xmlText = await upstreamResponse.text()
        return new NextResponse(xmlText, {
            status: 200,
            headers: {
                'Content-Type': upstreamResponse.headers.get('content-type') || 'application/xml; charset=utf-8',
                'Cache-Control': 'no-store',
            },
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return NextResponse.json({ error: `Proxy fetch failed: ${message}` }, { status: 502 })
    }
}
