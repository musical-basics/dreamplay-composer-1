'use server'

import { GoogleGenAI, Type } from '@google/genai'
import type { Anchor } from '@/lib/types'

export async function generateAiAnchors(
    totalMeasures: number,
    expectedCounts: Record<number, number>,
    heuristicAnchors: Anchor[],
    midiNotes: { t: number; p: number }[]
): Promise<Anchor[]> {
    // Requires GEMINI_API_KEY in your .env.local
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set in environment variables.")
    }

    const ai = new GoogleGenAI({ apiKey })

    const prompt = `You are an expert AI music alignment engine.
Your task is to map a live human piano performance (MIDI) to sheet music measures (MusicXML).

I am providing a JSON payload with three datasets:
1. "expectedCounts": The exact number of notes expected in each measure based on the sheet music.
2. "heuristicBaseline": A mathematical guess of the measure start times (calculated using an adaptive rolling average and chord-buffering).
3. "midiNotes": A simplified list of the actual MIDI notes played by the human (t = time in seconds, p = MIDI pitch).

The heuristic baseline is highly accurate for strictly metronomic playing, but fails during human rubato, ritardandos, accelerandos, or missed/extra notes.
A human playing a chord will strike multiple notes within a ~15ms-30ms window. These should be considered a single rhythmic grouping.

Your job is to analyze the 'midiNotes' density and 'expectedCounts', use the 'heuristicBaseline' as a starting reference, and output the TRUE start times for each measure. Measure 1 must start at the time of the very first note.

Return exactly ${totalMeasures} objects mapping the exact start time of each measure.`

    const fullPrompt = prompt + "\n\nDATA:\n" + JSON.stringify({ expectedCounts, heuristicBaseline: heuristicAnchors, midiNotes })

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        measure: { type: Type.INTEGER },
                        time: { type: Type.NUMBER }
                    },
                    required: ["measure", "time"]
                }
            },
            temperature: 0.1 // Keep it highly analytical and logical
        }
    })

    const text = response.text
    if (!text) {
        throw new Error("Empty response from AI")
    }

    return JSON.parse(text) as Anchor[]
}
