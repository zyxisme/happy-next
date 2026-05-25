import { getHappyVoiceGatewayUrl, getHappyVoicePublicKey } from './voiceConfig';
import { getServerUrl } from './serverConfig';
import { storage } from './storage';
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
