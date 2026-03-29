import type { NoteEvent, Anchor, BeatAnchor, XMLEvent } from '../types'

// ============================================================================
// AUDIO PEAK DETECTION
// ============================================================================
export async function getAudioOffset(audioUrl: string | null): Promise<number> {
    if (!audioUrl) return 0;
    try {
        console.log('[AutoMapper] Fetching audio to detect first peak offset...')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ac = new (window.AudioContext || (window as any).webkitAudioContext)();
        const response = await fetch(audioUrl);
        const buf = await response.arrayBuffer();
        const decoded = await ac.decodeAudioData(buf);
        const data = decoded.getChannelData(0);

        let maxAmp = 0;
        // Sample every 100th frame for speed to find general max amplitude
        for (let i = 0; i < data.length; i += 100) {
            if (Math.abs(data[i]) > maxAmp) maxAmp = Math.abs(data[i]);
        }

        // Find the very first moment it breaks 15% of max amplitude
        const threshold = maxAmp * 0.15;
        for (let i = 0; i < data.length; i++) {
            if (Math.abs(data[i]) > threshold) {
                const offset = i / decoded.sampleRate;
                console.log(`[AutoMapper] Found first audio peak at ${offset.toFixed(3)}s`);
                return offset;
            }
        }
    } catch (err) {
        console.error('[AutoMapper] Audio offset detection failed:', err);
    }
    return 0;
}


// ============================================================================
// V4: NOTE-BY-NOTE HEURISTIC MAPPER
// ============================================================================
export function autoMapByNoteV4(
    midiNotes: NoteEvent[],
    xmlEvents: XMLEvent[],
    totalMeasures: number,
    audioOffset: number
): { anchors: Anchor[], beatAnchors: BeatAnchor[] } {
    const anchors: Anchor[] = [];
    const beatAnchors: BeatAnchor[] = [];
    if (midiNotes.length === 0 || xmlEvents.length === 0) return { anchors, beatAnchors };

    console.log(`[AutoMapper V4] Starting note-by-note map. Audio Offset: ${audioOffset.toFixed(3)}s`);

    // 1. Group MIDI notes into rhythmic "chords" (events within 35ms of each other)
    const sortedMidi = [...midiNotes].sort((a, b) => a.startTimeSec - b.startTimeSec);
    const midiChords: { time: number, count: number }[] = [];

    let currentChordTime = sortedMidi[0].startTimeSec;
    let noteCount = 1;

    for (let i = 1; i < sortedMidi.length; i++) {
        const noteTime = sortedMidi[i].startTimeSec;
        if (noteTime - currentChordTime > 0.035) { // 35ms threshold
            midiChords.push({ time: currentChordTime, count: noteCount });
            currentChordTime = noteTime;
            noteCount = 1;
        } else {
            noteCount++;
        }
    }
    midiChords.push({ time: currentChordTime, count: noteCount });

    // 2. Apply Audio Shift (align first MIDI chord to the detected first audio peak)
    let shift = 0;
    if (audioOffset > 0 && midiChords.length > 0) {
        shift = audioOffset - midiChords[0].time;
    }

    const shiftedChords = midiChords.map(c => ({ time: Math.max(0, c.time + shift), count: c.count }));

    // 3. Measure-by-Measure Note Mapping
    let currentChordIdx = 0;
    let amd = 2.0;
    if (shiftedChords.length > 0) {
        const totalDur = shiftedChords[shiftedChords.length - 1].time - shiftedChords[0].time;
        amd = totalDur / totalMeasures;
    }

    let currentTime = shiftedChords.length > 0 ? shiftedChords[0].time : 0;

    for (let m = 1; m <= totalMeasures; m++) {
        const measureEvents = xmlEvents.filter(e => e.measure === m).sort((a, b) => a.beat - b.beat);
        const expectedChords = measureEvents.length;

        // Catch cursor up if lagging
        if (currentChordIdx < shiftedChords.length && currentTime < shiftedChords[currentChordIdx].time) {
            currentTime = shiftedChords[currentChordIdx].time;
        }

        const firstChordOfMeasureTime = currentChordIdx < shiftedChords.length ? shiftedChords[currentChordIdx].time : currentTime;

        // Create Measure Anchor
        anchors.push({ measure: m, time: firstChordOfMeasureTime });

        if (expectedChords === 0) {
            currentTime += amd;
            while (currentChordIdx < shiftedChords.length && shiftedChords[currentChordIdx].time < currentTime) {
                currentChordIdx++;
            }
            continue;
        }

        // --- Echolocation / Feeler Loop for CHORDS ---
        let matchedCount = 0;
        let tempIdx = currentChordIdx;
        let windowEnd = firstChordOfMeasureTime + amd;
        let lastMatchedTime = firstChordOfMeasureTime;

        let extensions = 0;
        const MAX_EXTENSIONS = 6;
        const FEELER_STEP = amd / 3;

        while (extensions <= MAX_EXTENSIONS) {
            tempIdx = currentChordIdx;
            matchedCount = 0;
            let windowLastTime = firstChordOfMeasureTime;

            while (tempIdx < shiftedChords.length && shiftedChords[tempIdx].time <= windowEnd) {
                windowLastTime = shiftedChords[tempIdx].time;
                matchedCount++;
                tempIdx++;
            }

            const ratio = matchedCount / expectedChords;

            if (ratio >= 0.8 && ratio <= 1.2) {
                lastMatchedTime = windowLastTime;
                break;
            } else if (ratio > 1.2) {
                matchedCount = 0;
                tempIdx = currentChordIdx;
                while (tempIdx < shiftedChords.length && matchedCount < expectedChords) {
                    lastMatchedTime = shiftedChords[tempIdx].time;
                    matchedCount++;
                    tempIdx++;
                }
                break;
            } else {
                extensions++;
                windowEnd += FEELER_STEP;
            }
        }

        if (extensions > MAX_EXTENSIONS) {
            lastMatchedTime = windowEnd;
        }

        // --- Distribute XML Events directly to the identified MIDI chords ---
        const chordsInMeasure = shiftedChords.slice(currentChordIdx, tempIdx);

        for (let i = 0; i < expectedChords; i++) {
            const xmlEv = measureEvents[i];
            let mappedTime = firstChordOfMeasureTime;

            if (i < chordsInMeasure.length) {
                // Perfect 1:1 match
                mappedTime = chordsInMeasure[i].time;
            } else if (chordsInMeasure.length > 0) {
                // Human missed a note/chord. Extrapolate slightly to keep spacing even.
                const chordSpacing = chordsInMeasure.length > 1 ?
                    (chordsInMeasure[chordsInMeasure.length - 1].time - chordsInMeasure[0].time) / (chordsInMeasure.length - 1) :
                    amd / expectedChords;
                mappedTime = chordsInMeasure[chordsInMeasure.length - 1].time + (chordSpacing * (i - chordsInMeasure.length + 1));
            } else {
                mappedTime = firstChordOfMeasureTime + (amd / expectedChords) * i;
            }

            // Drop a precise BeatAnchor for the exact fractional beat!
            if (xmlEv.beat > 1.01) {
                beatAnchors.push({ measure: xmlEv.measure, beat: xmlEv.beat, time: mappedTime });
            }
        }

        currentChordIdx = tempIdx;
        const measureDuration = Math.max(0.1, lastMatchedTime - firstChordOfMeasureTime);

        // Update AMD
        if (extensions > 0) {
            amd = (amd * 0.9) + (measureDuration * 0.1);
        } else {
            if (measureDuration >= amd * 0.3) {
                if (m === 1) amd = measureDuration;
                else amd = (amd * 0.7) + (measureDuration * 0.3);
            }
        }

        currentTime = lastMatchedTime + 0.01;
    }

    console.log(`[AutoMapper V4] Complete. Generated ${anchors.length} Measure Anchors and ${beatAnchors.length} Beat Anchors.`);
    return { anchors, beatAnchors };
}


// ============================================================================
// V3: MEASURE-LEVEL HEURISTIC MAPPER
// ============================================================================
export function autoMapMidiToScore(
    midiNotes: NoteEvent[],
    expectedCounts: Map<number, number>,
    totalMeasures: number
): Anchor[] {
    const anchors: Anchor[] = []
    if (midiNotes.length === 0 || totalMeasures === 0) {
        return anchors
    }

    const sortedMidi = [...midiNotes].sort((a, b) => a.startTimeSec - b.startTimeSec)

    let currentMidiIdx = 0
    let amd = 2.0

    if (sortedMidi.length > 0) {
        const totalDuration = sortedMidi[sortedMidi.length - 1].endTimeSec - sortedMidi[0].startTimeSec
        amd = totalDuration / totalMeasures
    }

    let currentTime = sortedMidi[0].startTimeSec
    let firstNoteOfMeasureTime = currentTime

    for (let m = 1; m <= totalMeasures; m++) {
        if (currentMidiIdx < sortedMidi.length && currentTime < sortedMidi[currentMidiIdx].startTimeSec) {
            currentTime = sortedMidi[currentMidiIdx].startTimeSec
        }

        if (currentMidiIdx < sortedMidi.length) {
            firstNoteOfMeasureTime = sortedMidi[currentMidiIdx].startTimeSec
        } else if (sortedMidi.length > 0) {
            firstNoteOfMeasureTime = sortedMidi[sortedMidi.length - 1].endTimeSec
        } else {
            firstNoteOfMeasureTime = currentTime
        }

        anchors.push({ measure: m, time: firstNoteOfMeasureTime })

        const expectedCount = expectedCounts.get(m) || 0

        if (expectedCount === 0) {
            currentTime += amd
            while (currentMidiIdx < sortedMidi.length && sortedMidi[currentMidiIdx].startTimeSec < currentTime) {
                currentMidiIdx++
            }
            continue
        }

        let matchedCount = 0
        let tempIdx = currentMidiIdx
        let windowEnd = firstNoteOfMeasureTime + amd
        let lastMatchedTime = firstNoteOfMeasureTime

        let extensions = 0
        const MAX_EXTENSIONS = 6
        const FEELER_STEP = amd / 3

        while (extensions <= MAX_EXTENSIONS) {
            tempIdx = currentMidiIdx
            matchedCount = 0
            let windowLastTime = firstNoteOfMeasureTime

            while (tempIdx < sortedMidi.length && sortedMidi[tempIdx].startTimeSec <= windowEnd) {
                windowLastTime = sortedMidi[tempIdx].endTimeSec
                matchedCount++
                tempIdx++
            }

            const ratio = matchedCount / expectedCount

            if (ratio >= 0.8 && ratio <= 1.2) {
                lastMatchedTime = windowLastTime
                break
            } else if (ratio > 1.2) {
                matchedCount = 0
                tempIdx = currentMidiIdx
                while (tempIdx < sortedMidi.length && matchedCount < expectedCount) {
                    lastMatchedTime = sortedMidi[tempIdx].endTimeSec
                    matchedCount++
                    tempIdx++
                }
                break
            } else {
                extensions++
                windowEnd += FEELER_STEP
            }
        }

        if (extensions > MAX_EXTENSIONS) {
            lastMatchedTime = windowEnd
        }

        while (
            tempIdx < sortedMidi.length &&
            tempIdx > currentMidiIdx &&
            (sortedMidi[tempIdx].startTimeSec - sortedMidi[tempIdx - 1].startTimeSec) <= 0.015
        ) {
            lastMatchedTime = Math.max(lastMatchedTime, sortedMidi[tempIdx].endTimeSec)
            tempIdx++
        }

        currentMidiIdx = tempIdx
        const measureDuration = Math.max(0.1, lastMatchedTime - firstNoteOfMeasureTime)

        if (extensions > 0) {
            amd = (amd * 0.9) + (measureDuration * 0.1)
        } else {
            if (measureDuration >= amd * 0.3) {
                if (m === 1) amd = measureDuration
                else amd = (amd * 0.7) + (measureDuration * 0.3)
            }
        }

        currentTime = lastMatchedTime + 0.01
    }

    return anchors
}
