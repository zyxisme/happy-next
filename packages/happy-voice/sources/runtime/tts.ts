import { randomUUID } from 'node:crypto';
import { env } from './env';

const TTS_URL = 'https://openspeech.bytedance.com/api/v1/tts';

interface VolcTtsResponse {
    code?: number;
    message?: string;
    data?: string; // base64 audio
}

/** Synthesize speech via Volcano big-model TTS. Returns base64 mp3. */
export async function synthesize(text: string): Promise<{ audioBase64: string; mimeType: string }> {
    const body = {
        app: {
            appid: env.VOLC_TTS_APP_ID,
            token: env.VOLC_TTS_TOKEN,
            cluster: env.VOLC_TTS_CLUSTER,
        },
        user: { uid: 'happy-voice' },
        audio: {
            voice_type: env.VOLC_TTS_VOICE_TYPE,
            encoding: 'mp3',
            speed_ratio: 1.0,
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
