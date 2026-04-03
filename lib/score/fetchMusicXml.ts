const ABSOLUTE_URL_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//
const PROTOCOL_RELATIVE_RE = /^\/\//
const PROBABLY_HOST_RE = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?::\d+)?(?:\/|$)/

function normalizeMusicXmlUrl(xmlUrl: string): string {
    const raw = xmlUrl.trim()
    if (!raw) throw new Error('MusicXML URL is empty')

    if (ABSOLUTE_URL_RE.test(raw)) return raw

    if (PROTOCOL_RELATIVE_RE.test(raw)) {
        if (typeof window !== 'undefined' && window.location.protocol) {
            return `${window.location.protocol}${raw}`
        }
        return `https:${raw}`
    }

    if (raw.startsWith('/') && typeof window !== 'undefined') {
        return new URL(raw, window.location.origin).toString()
    }

    if (PROBABLY_HOST_RE.test(raw)) {
        return `https://${raw}`
    }

    return raw
}

async function responseToXmlText(response: Response, source: 'direct' | 'proxy'): Promise<string> {
    if (!response.ok) {
        throw new Error(`MusicXML fetch failed (${source}): ${response.status} ${response.statusText}`)
    }

    const xmlText = await response.text()
    if (!xmlText.trim()) {
        throw new Error(`MusicXML fetch failed (${source}): empty response body`)
    }

    // Validate that the response looks like XML
    const trimmed = xmlText.trimStart()
    if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<score-partwise') && !trimmed.startsWith('<score-timewise') && !trimmed.startsWith('<!DOCTYPE')) {
        // Could be an HTML error page, JSON response, or other non-XML content
        const preview = trimmed.slice(0, 120).replace(/\n/g, ' ')
        throw new Error(`MusicXML fetch failed (${source}): response is not valid MusicXML. Starts with: "${preview}"`)
    }

    return xmlText
}

export async function fetchMusicXmlText(xmlUrl: string): Promise<{ xmlText: string; resolvedUrl: string }> {
    const resolvedUrl = normalizeMusicXmlUrl(xmlUrl)

    try {
        const directResponse = await fetch(resolvedUrl, { cache: 'no-store' })
        const xmlText = await responseToXmlText(directResponse, 'direct')
        return { xmlText, resolvedUrl }
    } catch (directError) {
        const proxyUrl = `/api/xml?url=${encodeURIComponent(resolvedUrl)}`

        try {
            const proxyResponse = await fetch(proxyUrl, { cache: 'no-store' })
            const xmlText = await responseToXmlText(proxyResponse, 'proxy')
            return { xmlText, resolvedUrl }
        } catch (proxyError) {
            const directMessage = directError instanceof Error ? directError.message : String(directError)
            const proxyMessage = proxyError instanceof Error ? proxyError.message : String(proxyError)
            throw new Error(`Unable to fetch MusicXML from ${resolvedUrl}. Direct fetch: ${directMessage}. Proxy fetch: ${proxyMessage}.`)
        }
    }
}
