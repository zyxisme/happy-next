import { MMKV } from 'react-native-mmkv';
import type { AppConfig } from './appConfig';

// Separate MMKV instance for voice config that persists across logouts
const voiceConfigStorage = new MMKV({ id: 'voice-config' });

const KEYS = {
    happyVoiceGatewayUrl: 'voice-happy-voice-gateway-url',
    happyVoicePublicKey: 'voice-happy-voice-public-key',
    sendConfirmation: 'voice-send-confirmation',
    sendConfirmationSpeed: 'voice-send-confirmation-speed',
    welcomeMessage: 'voice-welcome-message',
} as const;

// Keep a reference to the app config for fallback defaults
let configRef: AppConfig | undefined;

// ── Happy Voice ─────────────────────────────────────────────────────

export function getHappyVoiceGatewayUrl(): string | undefined {
    const stored = voiceConfigStorage.getString(KEYS.happyVoiceGatewayUrl);
    if (stored) return stored;
    return configRef?.voiceBaseUrl;
}

export function setHappyVoiceGatewayUrl(value: string | null): void {
    if (value && value.trim()) {
        voiceConfigStorage.set(KEYS.happyVoiceGatewayUrl, value.trim());
    } else {
        voiceConfigStorage.delete(KEYS.happyVoiceGatewayUrl);
    }
}

export function hasCustomHappyVoiceGatewayUrl(): boolean {
    return voiceConfigStorage.contains(KEYS.happyVoiceGatewayUrl);
}

export function getHappyVoicePublicKey(): string | undefined {
    const stored = voiceConfigStorage.getString(KEYS.happyVoicePublicKey);
    if (stored) return stored;
    return configRef?.voicePublicKey;
}

export function setHappyVoicePublicKey(value: string | null): void {
    if (value && value.trim()) {
        voiceConfigStorage.set(KEYS.happyVoicePublicKey, value.trim());
    } else {
        voiceConfigStorage.delete(KEYS.happyVoicePublicKey);
    }
}

export function hasCustomHappyVoicePublicKey(): boolean {
    return voiceConfigStorage.contains(KEYS.happyVoicePublicKey);
}

// ── Send Confirmation ──────────────────────────────────────────────

export function getSendConfirmation(): boolean {
    const stored = voiceConfigStorage.getBoolean(KEYS.sendConfirmation);
    return stored ?? true; // default: enabled
}

export function setSendConfirmation(value: boolean): void {
    voiceConfigStorage.set(KEYS.sendConfirmation, value);
}

export type SendConfirmationSpeed = 'fast' | 'normal' | 'slow';

const SPEED_SECONDS: Record<SendConfirmationSpeed, number> = {
    fast: 3,
    normal: 5,
    slow: 8,
};

export function getSendConfirmationSpeed(): SendConfirmationSpeed {
    const stored = voiceConfigStorage.getString(KEYS.sendConfirmationSpeed);
    if (stored === 'fast' || stored === 'normal' || stored === 'slow') return stored;
    return 'normal';
}

export function setSendConfirmationSpeed(value: SendConfirmationSpeed): void {
    voiceConfigStorage.set(KEYS.sendConfirmationSpeed, value);
}

export function getSendConfirmationSeconds(): number {
    return SPEED_SECONDS[getSendConfirmationSpeed()];
}

// ── Welcome Message ─────────────────────────────────────────────────

export function getWelcomeMessage(): string | undefined {
    return voiceConfigStorage.getString(KEYS.welcomeMessage) || undefined;
}

export function setWelcomeMessage(value: string | null): void {
    if (value && value.trim()) {
        voiceConfigStorage.set(KEYS.welcomeMessage, value.trim());
    } else {
        voiceConfigStorage.delete(KEYS.welcomeMessage);
    }
}

export function hasCustomWelcomeMessage(): boolean {
    return voiceConfigStorage.contains(KEYS.welcomeMessage);
}

// ── Utilities ───────────────────────────────────────────────────────

export function isUsingCustomVoiceConfig(): boolean {
    return hasCustomHappyVoiceGatewayUrl()
        || hasCustomHappyVoicePublicKey()
        || hasCustomWelcomeMessage();
}

export function resetVoiceConfig(): void {
    voiceConfigStorage.delete(KEYS.happyVoiceGatewayUrl);
    voiceConfigStorage.delete(KEYS.happyVoicePublicKey);
    voiceConfigStorage.delete(KEYS.welcomeMessage);
}

export function validateUrl(url: string): { valid: boolean; error?: string } {
    if (!url || !url.trim()) {
        return { valid: false, error: 'URL cannot be empty' };
    }
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return { valid: false, error: 'URL must use HTTP or HTTPS protocol' };
        }
        return { valid: true };
    } catch {
        return { valid: false, error: 'Invalid URL format' };
    }
}

// ── Init ────────────────────────────────────────────────────────────

/**
 * Called once at startup from config.ts.
 * Saves a reference to the app config for fallback defaults,
 * and syncs MMKV overrides into the mutable config object so
 * existing code that reads config.* gets the right values.
 */
export function initVoiceConfig(config: AppConfig): void {
    configRef = config;

    const gatewayUrl = voiceConfigStorage.getString(KEYS.happyVoiceGatewayUrl);
    if (gatewayUrl) {
        config.voiceBaseUrl = gatewayUrl;
    }

    const publicKey = voiceConfigStorage.getString(KEYS.happyVoicePublicKey);
    if (publicKey) {
        config.voicePublicKey = publicKey;
    }
}
