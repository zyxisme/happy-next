export type VoiceSessionState = 'starting' | 'active' | 'stopped' | 'error';

export interface HappyVoiceContextPayload {
    version: 1;
    format: 'happy-app-context-v1';
    contentType: 'text/plain';
    text: string;
    createdAt: string;
}

export interface VoiceSessionRecord {
    gatewaySessionId: string;
    userId: string;
    appSessionId: string;
    /** Volcano RTC room id */
    roomId: string;
    /** StartVoiceChat task id (== roomId by convention) */
    taskId: string;
    /** Human participant RTC uid */
    uid: string;
    /** AIGC agent (bot) RTC uid */
    agentUid: string;
    language?: string;
    state: VoiceSessionState;
    createdAt: string;
    updatedAt: string;
    expiresAt: string;
    lastError?: string;
}

export interface VoiceStartRequest {
    userId: string;
    sessionId: string;
    initialContextPayload?: HappyVoiceContextPayload;
    language?: string;
    toolBridgeBaseUrl?: string;
    welcomeMessage?: string;
    voiceType?: string;
    resourceId?: string;
    speechRate?: number;
}

export interface VoiceStartResponse {
    allowed: boolean;
    gatewaySessionId: string;
    provider: 'volc-rtc';
    appId: string;
    roomId: string;
    uid: string;
    agentUid: string;
    rtcToken: string;
    expiresAt: string;
}
