/**
 * Audio Helpers — Shared utilities for peak detection and audio analysis.
 * Replaces functionality previously housed in the legacy AutoMapper.
 */

export async function getAudioOffset(audioUrl: string | null): Promise<number> {
    if (!audioUrl) return 0;
    try {
        console.log('[AudioHelpers] Fetching audio to detect first peak offset...')
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
        if (!AudioContextClass) {
            console.warn('[AudioHelpers] Web Audio API not supported in this environment.');
            return 0;
        }

        const ac = new AudioContextClass();
        const response = await fetch(audioUrl);
        const buf = await response.arrayBuffer();
        const decoded = await ac.decodeAudioData(buf);
        const data = decoded.getChannelData(0);

        let maxAmp = 0;
        // Sample every 100th frame for speed to find general max amplitude
        for (let i = 0; i < data.length; i += 100) {
            const val = Math.abs(data[i]);
            if (val > maxAmp) maxAmp = val;
        }

        // Find the very first moment it breaks 15% of max amplitude
        const threshold = maxAmp * 0.15;
        for (let i = 0; i < data.length; i++) {
            if (Math.abs(data[i]) > threshold) {
                const offset = i / decoded.sampleRate;
                console.log(`[AudioHelpers] Found first audio peak at ${offset.toFixed(3)}s`);
                
                // Cleanup audio context to free memory
                await ac.close();
                return offset;
            }
        }
        
        await ac.close();
    } catch (err) {
        console.error('[AudioHelpers] Audio offset detection failed:', err);
    }
    return 0;
}
