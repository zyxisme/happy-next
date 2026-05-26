import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./env', () => ({
    env: {
        TTS_CLEAN_LLM: true,
        ARK_API_KEY: 'test-key',
        TTS_CLEAN_TIMEOUT_MS: 8000,
        TTS_CLEAN_SKIP_MAX_CHARS: 120,
    },
}));
vi.mock('./log', () => ({ logError: vi.fn() }));
vi.mock('./ark', () => ({ streamCleanForSpeech: vi.fn() }));

import { cleanForSpeech } from './cleanForSpeech';
import { streamCleanForSpeech } from './ark';

const mockStream = vi.mocked(streamCleanForSpeech);

beforeEach(() => { mockStream.mockReset(); });

describe('cleanForSpeech', () => {
    it('skips the LLM for short plain text (regex only)', async () => {
        const pieces: string[] = [];
        await cleanForSpeech('好的，已完成', (p) => { pieces.push(p); });
        expect(mockStream).not.toHaveBeenCalled();
        expect(pieces).toEqual(['好的，已完成']);
    });

    it('streams LLM deltas when the text needs cleaning', async () => {
        mockStream.mockImplementation(async (_text, onDelta) => {
            await onDelta('执行 ');
            await onDelta('构建命令');
        });
        const pieces: string[] = [];
        await cleanForSpeech('执行 `yarn build` 命令', (p) => { pieces.push(p); });
        expect(mockStream).toHaveBeenCalledOnce();
        expect(pieces).toEqual(['执行 ', '构建命令']);
    });

    it('falls back to regex (returns true) when the LLM throws before emitting', async () => {
        mockStream.mockRejectedValue(new Error('ark down'));
        const pieces: string[] = [];
        const ok = await cleanForSpeech('执行 `yarn build` 命令', (p) => { pieces.push(p); });
        expect(ok).toBe(true);
        expect(pieces).toEqual(['执行 命令']);
    });

    it('returns false without re-emitting when the LLM fails after a partial emit', async () => {
        mockStream.mockImplementation(async (_text, onDelta) => {
            await onDelta('部分内容');
            throw new Error('mid-stream failure');
        });
        const pieces: string[] = [];
        const ok = await cleanForSpeech('执行 `yarn build` 命令', (p) => { pieces.push(p); });
        expect(ok).toBe(false);
        expect(pieces).toEqual(['部分内容']);
    });
});
