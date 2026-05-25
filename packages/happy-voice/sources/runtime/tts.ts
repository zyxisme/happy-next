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

/** Synthesize text to a WAV buffer using the configured AGENT_TTS provider. */
export async function synthesizeToWav(text: string): Promise<Buffer> {
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
