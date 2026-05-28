import type { AppConfig } from './appConfig';
import type { Settings } from './settings';
import { storage } from './storage';
import { sync } from './sync';
export type ActionConfirmationSpeed = 'fast' | 'normal' | 'slow';

// Reference to app config for fallback defaults (set in initVoiceConfig).
let configRef: AppConfig | undefined;

// Top-level `import { sync }` is safe here even though config.ts loads voiceConfig at
// module-init time: `sync` is only read inside functions (never during module evaluation),
// so any import cycle resolves cleanly. Matches the existing pattern in profileSync.ts.
function applyVoiceSetting(delta: Partial<Settings>): void {
    sync.applySettings(delta);
}

function normalizeCustomValue(value: string | null, defaultValue: string | undefined): string | null {
    const normalized = value?.trim();
    if (!normalized) return null;
    return normalized === defaultValue?.trim() ? null : normalized;
}

function settings(): Settings {
    return storage.getState().settings;
}

// ── Happy Voice ─────────────────────────────────────────────────────

export function getHappyVoiceGatewayUrl(): string | undefined {
    return settings().voiceAssistantGatewayUrl ?? configRef?.voiceBaseUrl;
}

export function setHappyVoiceGatewayUrl(value: string | null): void {
    applyVoiceSetting({ voiceAssistantGatewayUrl: normalizeCustomValue(value, configRef?.voiceBaseUrl) });
}

export function hasCustomHappyVoiceGatewayUrl(): boolean {
    return settings().voiceAssistantGatewayUrl != null;
}

export function getHappyVoicePublicKey(): string | undefined {
    return settings().voiceAssistantPublicKey ?? configRef?.voicePublicKey;
}

export function setHappyVoicePublicKey(value: string | null): void {
    applyVoiceSetting({ voiceAssistantPublicKey: normalizeCustomValue(value, configRef?.voicePublicKey) });
}

export function setHappyVoiceConfig(gatewayUrl: string | null, publicKey: string | null): void {
    applyVoiceSetting({
        voiceAssistantGatewayUrl: normalizeCustomValue(gatewayUrl, configRef?.voiceBaseUrl),
        voiceAssistantPublicKey: normalizeCustomValue(publicKey, configRef?.voicePublicKey),
    });
}

export function hasCustomHappyVoicePublicKey(): boolean {
    return settings().voiceAssistantPublicKey != null;
}

// ── Action Confirmation ──────────────────────────────────────────────

export function getActionConfirmation(): boolean {
    return settings().voiceAssistantActionConfirmation;
}

export function setActionConfirmation(value: boolean): void {
    applyVoiceSetting({ voiceAssistantActionConfirmation: value });
}

const SPEED_SECONDS: Record<ActionConfirmationSpeed, number> = {
    fast: 3,
    normal: 5,
    slow: 8,
};

export function getActionConfirmationSpeed(): ActionConfirmationSpeed {
    return settings().voiceAssistantActionConfirmationSpeed;
}

export function setActionConfirmationSpeed(value: ActionConfirmationSpeed): void {
    applyVoiceSetting({ voiceAssistantActionConfirmationSpeed: value });
}

export function getActionConfirmationSeconds(): number {
    return SPEED_SECONDS[getActionConfirmationSpeed()];
}

// ── Welcome Message ─────────────────────────────────────────────────

export function getWelcomeMessage(): string | undefined {
    return settings().voiceAssistantWelcomeMessage ?? undefined;
}

export function setWelcomeMessage(value: string | null): void {
    applyVoiceSetting({ voiceAssistantWelcomeMessage: value && value.trim() ? value.trim() : null });
}

export function hasCustomWelcomeMessage(): boolean {
    return settings().voiceAssistantWelcomeMessage != null;
}

// ── Utilities ───────────────────────────────────────────────────────

export function isUsingCustomVoiceConfig(): boolean {
    return hasCustomHappyVoiceGatewayUrl()
        || hasCustomHappyVoicePublicKey()
        || hasCustomWelcomeMessage();
}

export function resetVoiceConfig(): void {
    applyVoiceSetting({
        voiceAssistantGatewayUrl: null,
        voiceAssistantPublicKey: null,
        voiceAssistantWelcomeMessage: null,
    });
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

/** Called once at startup from config.ts to retain app-config fallbacks. */
export function initVoiceConfig(config: AppConfig): void {
    configRef = config;
}
