import { randomUUID } from 'node:crypto';
import { env } from './env';

const TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts';

interface VolcTtsResponse {
    code?: number;
    message?: string;
    data?: string; // base64 audio
}

export interface SynthesizeOptions {
    /** User-selected voice (VoiceType). Falls back to env default when omitted. */
    voiceType?: string;
    /** Speech rate, -50..100 (0 = normal). Mapped to speed_ratio for this REST API. */
    speechRate?: number;
}

/**
 * Map the unified speechRate scale (-50..100, 0 = normal) to the one-shot REST
 * TTS `speed_ratio` (1.0 = normal). Linear: rate/100 + 1, clamped to [0.5, 2.0].
 * e.g. -50 → 0.5, 0 → 1.0, 100 → 2.0.
 */
export function speechRateToSpeedRatio(rate: number | undefined): number {
    if (!rate) return 1.0;
    const ratio = 1 + rate / 100;
    return Math.min(2.0, Math.max(0.5, ratio));
}

/** Synthesize speech via Volcano big-model TTS. Returns base64 mp3. */
export async function synthesize(
    text: string,
    opts: SynthesizeOptions = {},
): Promise<{ audioBase64: string; mimeType: string }> {
    const body = {
        app: {
            appid: env.VOLC_TTS_APP_ID,
            token: env.VOLC_TTS_TOKEN,
            cluster: env.VOLC_TTS_CLUSTER,
        },
        user: { uid: 'happy-voice' },
        audio: {
            voice_type: opts.voiceType || env.VOLC_TTS_VOICE,
            encoding: 'mp3',
            speed_ratio: speechRateToSpeedRatio(opts.speechRate),
        },
        request: {
            reqid: randomUUID(),
            text,
            operation: 'query',
        },
    };

    const res = await fetch(TTS_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer;${env.VOLC_TTS_TOKEN}`,
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Volcano TTS HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as VolcTtsResponse;
    if (!data.data) {
        throw new Error(`Volcano TTS failed: code=${data.code} message=${data.message}`);
    }
    return { audioBase64: data.data, mimeType: 'audio/mpeg' };
}
