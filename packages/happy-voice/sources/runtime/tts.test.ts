import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./env', () => ({
    env: {
        VOLC_TTS_APP_ID: 'app',
        VOLC_TTS_TOKEN: 'tok',
        VOLC_TTS_CLUSTER: 'volcano_tts',
        VOLC_TTS_VOICE: 'zh_female_vv_uranus_bigtts',
    },
}));

import { synthesize, speechRateToSpeedRatio } from './tts';

describe('speechRateToSpeedRatio', () => {
    it('maps 0/undefined to 1.0 (normal)', () => {
        expect(speechRateToSpeedRatio(0)).toBe(1.0);
        expect(speechRateToSpeedRatio(undefined)).toBe(1.0);
    });

    it('maps the -50..100 range into [0.5, 2.0]', () => {
        expect(speechRateToSpeedRatio(-50)).toBeCloseTo(0.5);
        expect(speechRateToSpeedRatio(100)).toBeCloseTo(2.0);
        expect(speechRateToSpeedRatio(50)).toBeCloseTo(1.5);
    });

    it('clamps out-of-range input', () => {
        expect(speechRateToSpeedRatio(-200)).toBe(0.5);
        expect(speechRateToSpeedRatio(500)).toBe(2.0);
    });
});

describe('synthesize request body', () => {
    let captured: any;
    beforeEach(() => {
        captured = null;
        vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
            captured = JSON.parse(init.body);
            return { ok: true, json: async () => ({ data: 'AAAA' }) } as any;
        }));
    });

    it('uses env default voice and normal speed when no opts', async () => {
        await synthesize('你好');
        expect(captured.audio.voice_type).toBe('zh_female_vv_uranus_bigtts');
        expect(captured.audio.speed_ratio).toBe(1.0);
    });

    it('applies the selected voice and mapped speech rate', async () => {
        await synthesize('你好', { voiceType: 'zh_male_test_bigtts', speechRate: 50 });
        expect(captured.audio.voice_type).toBe('zh_male_test_bigtts');
        expect(captured.audio.speed_ratio).toBeCloseTo(1.5);
    });
});
