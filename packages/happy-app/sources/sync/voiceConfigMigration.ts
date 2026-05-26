import type { Settings } from './settings';

export type SendConfirmationSpeed = 'fast' | 'normal' | 'slow';

/** Legacy values read from the old `voice-config` MMKV instance (only present keys are set). */
export interface LegacyVoiceConfig {
    gatewayUrl?: string;
    publicKey?: string;
    sendConfirmation?: boolean;
    sendConfirmationSpeed?: SendConfirmationSpeed;
    welcomeMessage?: string;
}

/** Pure mapping: legacy MMKV snapshot -> synced-settings delta. Only present keys are migrated. */
export function buildVoiceConfigMigrationDelta(old: LegacyVoiceConfig): Partial<Settings> {
    const delta: Partial<Settings> = {};
    if (old.gatewayUrl !== undefined) delta.voiceAssistantGatewayUrl = old.gatewayUrl;
    if (old.publicKey !== undefined) delta.voiceAssistantPublicKey = old.publicKey;
    if (old.sendConfirmation !== undefined) delta.voiceAssistantSendConfirmation = old.sendConfirmation;
    if (old.sendConfirmationSpeed !== undefined) delta.voiceAssistantSendConfirmationSpeed = old.sendConfirmationSpeed;
    if (old.welcomeMessage !== undefined) delta.voiceAssistantWelcomeMessage = old.welcomeMessage;
    return delta;
}
