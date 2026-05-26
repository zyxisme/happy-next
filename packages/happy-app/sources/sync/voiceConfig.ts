import { MMKV } from 'react-native-mmkv';
import type { AppConfig } from './appConfig';
import type { Settings } from './settings';
import { storage } from './storage';
import { sync } from './sync';
import {
    buildVoiceConfigMigrationDelta,
    type LegacyVoiceConfig,
    type SendConfirmationSpeed,
} from './voiceConfigMigration';

// Re-export so existing consumers (e.g. settings/voice.tsx) keep importing the type from here.
export type { SendConfirmationSpeed } from './voiceConfigMigration';

// Legacy MMKV instance — retained read-only for the one-time migration (added in Task 4).
const legacyStorage = new MMKV({ id: 'voice-config' });

const LEGACY_KEYS = {
    happyVoiceGatewayUrl: 'voice-happy-voice-gateway-url',
    happyVoicePublicKey: 'voice-happy-voice-public-key',
    sendConfirmation: 'voice-send-confirmation',
    sendConfirmationSpeed: 'voice-send-confirmation-speed',
    welcomeMessage: 'voice-welcome-message',
} as const;

const MIGRATION_DONE_KEY = 'voice-config-migrated-to-settings';

// Reference to app config for fallback defaults (set in initVoiceConfig).
let configRef: AppConfig | undefined;

// Top-level `import { sync }` is safe here even though config.ts loads voiceConfig at
// module-init time: `sync` is only read inside functions (never during module evaluation),
// so any import cycle resolves cleanly. Matches the existing pattern in profileSync.ts.
function applyVoiceSetting(delta: Partial<Settings>): void {
    sync.applySettings(delta);
}

function settings(): Settings {
    return storage.getState().settings;
}

// ── Happy Voice ─────────────────────────────────────────────────────

export function getHappyVoiceGatewayUrl(): string | undefined {
    return settings().voiceAssistantGatewayUrl ?? configRef?.voiceBaseUrl;
}

export function setHappyVoiceGatewayUrl(value: string | null): void {
    applyVoiceSetting({ voiceAssistantGatewayUrl: value && value.trim() ? value.trim() : null });
}

export function hasCustomHappyVoiceGatewayUrl(): boolean {
    return settings().voiceAssistantGatewayUrl != null;
}

export function getHappyVoicePublicKey(): string | undefined {
    return settings().voiceAssistantPublicKey ?? configRef?.voicePublicKey;
}

export function setHappyVoicePublicKey(value: string | null): void {
    applyVoiceSetting({ voiceAssistantPublicKey: value && value.trim() ? value.trim() : null });
}

export function hasCustomHappyVoicePublicKey(): boolean {
    return settings().voiceAssistantPublicKey != null;
}

// ── Send Confirmation ──────────────────────────────────────────────

export function getSendConfirmation(): boolean {
    return settings().voiceAssistantSendConfirmation;
}

export function setSendConfirmation(value: boolean): void {
    applyVoiceSetting({ voiceAssistantSendConfirmation: value });
}

const SPEED_SECONDS: Record<SendConfirmationSpeed, number> = {
    fast: 3,
    normal: 5,
    slow: 8,
};

export function getSendConfirmationSpeed(): SendConfirmationSpeed {
    return settings().voiceAssistantSendConfirmationSpeed;
}

export function setSendConfirmationSpeed(value: SendConfirmationSpeed): void {
    applyVoiceSetting({ voiceAssistantSendConfirmationSpeed: value });
}

export function getSendConfirmationSeconds(): number {
    return SPEED_SECONDS[getSendConfirmationSpeed()];
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

// ── Migration ───────────────────────────────────────────────────────

/** A legacy string value counts as customized only if it is non-empty after trimming. */
function readLegacyString(key: string): string | undefined {
    const raw = legacyStorage.getString(key);
    const trimmed = raw?.trim();
    return trimmed ? trimmed : undefined;
}

/**
 * One-time migration of the legacy `voice-config` MMKV values into synced settings.
 * Idempotent: guarded by a MMKV flag. Only migrates keys the user actually customized,
 * so it never overwrites a synced-settings value with a default. Empty/whitespace-only
 * legacy strings are treated as "not customized" (matches the old getter semantics).
 */
export function migrateVoiceConfigToSettings(): void {
    if (legacyStorage.getBoolean(MIGRATION_DONE_KEY)) return;

    const old: LegacyVoiceConfig = {};

    const gatewayUrl = readLegacyString(LEGACY_KEYS.happyVoiceGatewayUrl);
    if (gatewayUrl !== undefined) old.gatewayUrl = gatewayUrl;

    const publicKey = readLegacyString(LEGACY_KEYS.happyVoicePublicKey);
    if (publicKey !== undefined) old.publicKey = publicKey;

    if (legacyStorage.contains(LEGACY_KEYS.sendConfirmation)) {
        old.sendConfirmation = legacyStorage.getBoolean(LEGACY_KEYS.sendConfirmation);
    }

    if (legacyStorage.contains(LEGACY_KEYS.sendConfirmationSpeed)) {
        const s = legacyStorage.getString(LEGACY_KEYS.sendConfirmationSpeed);
        if (s === 'fast' || s === 'normal' || s === 'slow') old.sendConfirmationSpeed = s;
    }

    const welcomeMessage = readLegacyString(LEGACY_KEYS.welcomeMessage);
    if (welcomeMessage !== undefined) old.welcomeMessage = welcomeMessage;

    const delta = buildVoiceConfigMigrationDelta(old);
    if (Object.keys(delta).length > 0) {
        applyVoiceSetting(delta);
    }

    // Mark done and drop legacy keys regardless (nothing to migrate is also "done").
    legacyStorage.set(MIGRATION_DONE_KEY, true);
    for (const key of Object.values(LEGACY_KEYS)) legacyStorage.delete(key);
}

// ── Init ────────────────────────────────────────────────────────────

/** Called once at startup from config.ts to retain app-config fallbacks. */
export function initVoiceConfig(config: AppConfig): void {
    configRef = config;
}
