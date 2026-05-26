import { getHappyVoiceGatewayUrl, getHappyVoicePublicKey } from './voiceConfig';
import { getServerUrl } from './serverConfig';
import { storage } from './storage';
import { cleanForSpeech } from '@/realtime/happyVoiceProtocol';
import type { HappyVoiceContextPayload } from '@/realtime/HappyVoiceContextSerializer';

export interface HappyVoiceStartResponse {
    allowed: boolean;
    gatewaySessionId: string;
    /** 'volc-rtc' for the Volcano Engine gateway. */
    provider: 'volc-rtc';
    /** Volcano RTC application id. */
    appId: string;
    /** RTC room id to join. */
    roomId: string;
    /** Human participant RTC uid. */
    uid: string;
    /** AIGC agent (bot) RTC uid — target for control messages. */
    agentUid: string;
    /** RTC join token (AppId + AppKey). */
    rtcToken: string;
    expiresAt: string;
}

function getVoiceGatewayUrl() {
    const baseUrl = getHappyVoiceGatewayUrl();
    if (!baseUrl) {
        throw new Error('voiceBaseUrl is not configured');
    }
    if (baseUrl.startsWith('/')) {
        const origin = (globalThis as { location?: { origin?: unknown } }).location?.origin;
        if (typeof origin === 'string' && origin) {
            return `${origin}${baseUrl}`.replace(/\/+$/, '');
        }
    }
    return baseUrl.replace(/\/+$/, '');
}

function getVoiceGatewayHeaders() {
    const voicePublicKey = getHappyVoicePublicKey();
    if (!voicePublicKey) {
        throw new Error('voicePublicKey is not configured');
    }

    return {
        'Content-Type': 'application/json',
        'x-voice-key': voicePublicKey,
    };
}

export async function startHappyVoiceSession(
    sessionId: string,
    initialContextPayload?: HappyVoiceContextPayload,
    language?: string,
    welcomeMessage?: string,
): Promise<HappyVoiceStartResponse> {
    const userId = storage.getState().profile.id;
    if (!userId) {
        throw new Error('profile.id is missing');
    }

    const toolBridgeBaseUrl = process.env.EXPO_PUBLIC_VOICE_TOOL_BRIDGE_BASE_URL || getServerUrl();

    const response = await fetch(`${getVoiceGatewayUrl()}/v1/voice/session/start`, {
        method: 'POST',
        headers: getVoiceGatewayHeaders(),
        body: JSON.stringify({
            userId,
            sessionId,
            initialContextPayload,
            language,
            toolBridgeBaseUrl,
            welcomeMessage,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to start voice session: ${response.status} ${errorText}`);
    }

    return await response.json();
}

export async function stopHappyVoiceSession(gatewaySessionId: string): Promise<void> {
    const response = await fetch(`${getVoiceGatewayUrl()}/v1/voice/session/stop`, {
        method: 'POST',
        headers: getVoiceGatewayHeaders(),
        body: JSON.stringify({ gatewaySessionId }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to stop voice session: ${response.status} ${errorText}`);
    }
}

// NOTE: mid-session text/context injection now happens client-side over RTC
// control messages (see HappyVoiceSession.web.tsx), so the gateway no longer
// exposes /session/text or /session/context.

export interface HappyVoiceTtsResponse {
    audioBase64: string;
    mimeType: string;
}

export async function synthesizeSpeech(text: string): Promise<HappyVoiceTtsResponse> {
    const response = await fetch(`${getVoiceGatewayUrl()}/v1/voice/tts`, {
        method: 'POST',
        headers: getVoiceGatewayHeaders(),
        body: JSON.stringify({ text }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to synthesize speech: ${response.status} ${errorText}`);
    }

    return await response.json();
}

export interface TtsStreamChunk {
    seq: number;
    text: string;
    audioBase64: string;
    mimeType: string;
}

/**
 * Streamed "read message aloud" (web): the gateway LLM-cleans + splits into
 * sentences and pushes audio chunks over SSE; onChunk fires per sentence so the
 * client can play progressively. Uses fetch ReadableStream (web only).
 */
export async function streamSpeech(
    text: string,
    onChunk: (chunk: TtsStreamChunk) => void,
    signal?: AbortSignal,
    fetchImpl: typeof fetch = fetch,
): Promise<void> {
    const response = await fetchImpl(`${getVoiceGatewayUrl()}/v1/voice/tts/stream`, {
        method: 'POST',
        headers: getVoiceGatewayHeaders(),
        body: JSON.stringify({ text }),
        signal,
    });
    if (!response.ok || !response.body) {
        throw new Error(`Failed to stream speech: ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
            const evt = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            for (const line of evt.split('\n')) {
                if (!line.startsWith('data:')) continue;
                const data = line.slice(5).trim();
                if (data === '[DONE]') return;
                try {
                    const obj = JSON.parse(data) as TtsStreamChunk;
                    if (obj.audioBase64) onChunk(obj);
                } catch {
                    // ignore
                }
            }
        }
    }
}

/**
 * LLM-clean text for speech via the gateway (regex fallback). Used by the in-call
 * "announce Happy's reply" path before handing text to ExternalTextToSpeech.
 * Always resolves to speakable text — falls back to client-side regex on any error.
 */
export async function cleanSpeechText(text: string): Promise<string> {
    try {
        const response = await fetch(`${getVoiceGatewayUrl()}/v1/voice/clean`, {
            method: 'POST',
            headers: getVoiceGatewayHeaders(),
            body: JSON.stringify({ text }),
        });
        if (!response.ok) {
            throw new Error(`Failed to clean speech: ${response.status}`);
        }
        const data = (await response.json()) as { text?: string };
        return (data.text && data.text.trim()) || cleanForSpeech(text);
    } catch {
        return cleanForSpeech(text);
    }
}
