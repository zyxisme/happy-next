import * as cartesiaTts from '@livekit/agents-plugin-cartesia';
import * as elevenlabsTts from '@livekit/agents-plugin-elevenlabs';
import * as openaiPlugin from '@livekit/agents-plugin-openai';
import { env } from './env';

/** Strip provider prefix: "openai/gpt-5.2" → "gpt-5.2" */
export function stripProviderPrefix(modelString: string): string {
    const idx = modelString.indexOf('/');
    return idx !== -1 ? modelString.slice(idx + 1) : modelString;
}

/** Parse TTS model string: "cartesia/sonic-3:voice-id" → { model, voice } */
export function parseTTSModelString(modelString: string): { model: string; voice?: string } {
    const name = stripProviderPrefix(modelString);
    const idx = name.indexOf(':');
    if (idx !== -1) {
        return { model: name.slice(0, idx), voice: name.slice(idx + 1) };
    }
    return { model: name };
}

/** Create a TTS instance: "cartesia/...", "openai/...", "elevenlabs/..." uses direct plugin, otherwise LiveKit Inference string. */
export function createTts(modelString: string): cartesiaTts.TTS | openaiPlugin.TTS | elevenlabsTts.TTS | string {
    if (modelString.startsWith('cartesia/')) {
        const { model, voice } = parseTTSModelString(modelString);
        return new cartesiaTts.TTS({ model, voice, language: 'zh' });
    }
    if (modelString.startsWith('openai/')) {
        const { model, voice } = parseTTSModelString(modelString);
        return new openaiPlugin.TTS({ model, voice: (voice || 'alloy') as any });
    }
    if (modelString.startsWith('elevenlabs/')) {
        const { model, voice } = parseTTSModelString(modelString);
        return new elevenlabsTts.TTS({ model, voiceId: voice });
    }
    return modelString;
}

/** Encode signed-16-bit PCM samples into a WAV file buffer. */
export function encodeWav(pcm: Int16Array, sampleRate: number, channels: number): Buffer {
    const bytesPerSample = 2;
    const blockAlign = channels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm.length * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataSize);

    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);            // fmt chunk size
    buffer.writeUInt16LE(1, 20);             // PCM format
    buffer.writeUInt16LE(channels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(8 * bytesPerSample, 34); // bits per sample
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataSize, 40);

    for (let i = 0; i < pcm.length; i++) {
        buffer.writeInt16LE(pcm[i], 44 + i * bytesPerSample);
    }
    return buffer;
}

// Cartesia REST. The LiveKit cartesia plugin's synthesize().collect() frames the
// streamed audio through its real-time AudioByteStream machinery, which for a
// one-shot request is ~3x slower than the plain /tts/bytes REST endpoint
// (measured ~13s vs ~4.5s for 90 zh chars). For this one-shot endpoint we call
// REST directly.
const CARTESIA_TTS_URL = 'https://api.cartesia.ai/tts/bytes';
const CARTESIA_VERSION = '2024-11-13';

/** Build the Cartesia /tts/bytes request from a "cartesia/<model>:<voice>" string. Pure / testable. */
export function buildCartesiaTtsRequest(modelString: string, text: string): {
    url: string;
    headers: Record<string, string>;
    body: string;
} {
    const apiKey = env.CARTESIA_API_KEY;
    if (!apiKey) {
        throw new Error('CARTESIA_API_KEY is required for Cartesia TTS synthesis');
    }
    const { model, voice } = parseTTSModelString(modelString);
    if (!voice) {
        throw new Error(`Cartesia AGENT_TTS "${modelString}" is missing a voice id`);
    }
    return {
        url: CARTESIA_TTS_URL,
        headers: {
            'Cartesia-Version': CARTESIA_VERSION,
            'X-API-Key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model_id: model,
            transcript: text,
            voice: { mode: 'id', id: voice },
            language: 'zh',
            output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 44100 },
        }),
    };
}

async function synthesizeCartesiaToWav(modelString: string, text: string): Promise<Buffer> {
    const { url, headers, body } = buildCartesiaTtsRequest(modelString, text);
    const res = await fetch(url, { method: 'POST', headers, body });
    if (!res.ok) {
        // Truncate: the provider error body can carry internal details (e.g. key info).
        const errText = (await res.text().catch(() => '')).slice(0, 300);
        throw new Error(`Cartesia TTS failed: ${res.status} ${errText}`);
    }
    return Buffer.from(await res.arrayBuffer());
}

/** Synthesize text to a WAV buffer using the configured AGENT_TTS provider. */
export async function synthesizeToWav(text: string): Promise<Buffer> {
    // Cartesia: call REST directly (the streaming plugin paces audio ~real-time).
    if (env.AGENT_TTS.startsWith('cartesia/')) {
        return synthesizeCartesiaToWav(env.AGENT_TTS, text);
    }
    // Other providers: fall back to the LiveKit plugin's one-shot collect().
    const tts = createTts(env.AGENT_TTS);
    if (typeof tts === 'string') {
        throw new Error(`AGENT_TTS "${env.AGENT_TTS}" is not a directly synthesizable provider`);
    }
    const stream = tts.synthesize(text);
    try {
        const frame = await stream.collect();
        return encodeWav(frame.data, frame.sampleRate, frame.channels);
    } finally {
        stream.close();
    }
}
