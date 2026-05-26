import { describe, it, expect } from 'vitest';
import { buildVoiceConfigMigrationDelta } from './voiceConfigMigration';

describe('buildVoiceConfigMigrationDelta', () => {
    it('returns empty delta when nothing was customized', () => {
        expect(buildVoiceConfigMigrationDelta({})).toEqual({});
    });

    it('maps only the keys that were present in legacy storage', () => {
        expect(buildVoiceConfigMigrationDelta({
            gatewayUrl: 'https://gw.example.com',
            sendConfirmation: false,
        })).toEqual({
            voiceAssistantGatewayUrl: 'https://gw.example.com',
            voiceAssistantSendConfirmation: false,
        });
    });

    it('maps all legacy fields when all present', () => {
        expect(buildVoiceConfigMigrationDelta({
            gatewayUrl: 'https://gw',
            publicKey: 'pk_123',
            sendConfirmation: true,
            sendConfirmationSpeed: 'fast',
            welcomeMessage: 'hi there',
        })).toEqual({
            voiceAssistantGatewayUrl: 'https://gw',
            voiceAssistantPublicKey: 'pk_123',
            voiceAssistantSendConfirmation: true,
            voiceAssistantSendConfirmationSpeed: 'fast',
            voiceAssistantWelcomeMessage: 'hi there',
        });
    });
});
