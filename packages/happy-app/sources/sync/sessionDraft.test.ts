import { describe, it, expect } from 'vitest';

/**
 * Tests the draft normalization + store-update rules. Mirrors `normalizeDraft`
 * (persistence.ts) and the `setDraft` action (storage.ts), kept in sync by
 * convention like thinkingStateMerge.test.ts — the real code pulls in
 * react-native-mmkv, which can't load under the node test environment.
 *
 * The architecture this protects: drafts are a single source of truth living in
 * their own map (never on the Session object), so a sent+cleared draft can't be
 * resurrected by session sync/merge/cache. The only rules that matter here are:
 *   - an empty draft (no trimmed text, no images) is normalized to "no draft";
 *   - setting/clearing updates the map and is a no-op when nothing changes.
 */

interface SessionDraft {
    text: string;
    images: Array<{ uri: string; width: number; height: number; mimeType: string }>;
}

function normalizeDraft(draft: SessionDraft | null | undefined): SessionDraft | null {
    if (draft && (draft.text.trim() || draft.images.length > 0)) {
        return draft;
    }
    return null;
}

// Mirrors setDraft: returns the next drafts map, or the SAME reference on no-op.
function applyDraft(
    drafts: Record<string, SessionDraft>,
    sessionId: string,
    draft: SessionDraft | null,
): Record<string, SessionDraft> {
    const normalized = normalizeDraft(draft);
    const existing = drafts[sessionId] ?? null;
    if (normalized === null && existing === null) return drafts;
    if (normalized === existing) return drafts;
    const next = { ...drafts };
    if (normalized === null) {
        delete next[sessionId];
    } else {
        next[sessionId] = normalized;
    }
    return next;
}

const img = { uri: 'file://a.png', width: 1, height: 1, mimeType: 'image/png' };

describe('normalizeDraft', () => {
    it('treats empty text + no images as no draft', () => {
        expect(normalizeDraft({ text: '', images: [] })).toBeNull();
    });

    it('treats whitespace-only text + no images as no draft', () => {
        expect(normalizeDraft({ text: '   \n\t ', images: [] })).toBeNull();
    });

    it('keeps a draft with non-empty text', () => {
        const d = { text: 'hello', images: [] };
        expect(normalizeDraft(d)).toBe(d);
    });

    it('keeps a draft that only has images (no text)', () => {
        const d = { text: '   ', images: [img] };
        expect(normalizeDraft(d)).toBe(d);
    });

    it('treats null/undefined as no draft', () => {
        expect(normalizeDraft(null)).toBeNull();
        expect(normalizeDraft(undefined)).toBeNull();
    });
});

describe('setDraft store update', () => {
    it('stores a non-empty draft under the session id', () => {
        const next = applyDraft({}, 's1', { text: 'hi', images: [] });
        expect(next).toEqual({ s1: { text: 'hi', images: [] } });
    });

    it('deletes the entry when cleared with null', () => {
        const start = { s1: { text: 'hi', images: [] } };
        const next = applyDraft(start, 's1', null);
        expect(next).toEqual({});
        expect(next).not.toBe(start);
    });

    it('deletes the entry when set to an empty draft', () => {
        const start = { s1: { text: 'hi', images: [] } };
        const next = applyDraft(start, 's1', { text: '  ', images: [] });
        expect(next).toEqual({});
    });

    it('is a no-op (same reference) when clearing an already-absent draft', () => {
        const start = { s2: { text: 'keep', images: [] } };
        const next = applyDraft(start, 's1', null);
        expect(next).toBe(start);
    });

    it('does not disturb other sessions when updating one', () => {
        const start = { s1: { text: 'a', images: [] }, s2: { text: 'b', images: [] } };
        const next = applyDraft(start, 's1', { text: 'a2', images: [] });
        expect(next.s2).toBe(start.s2);
        expect(next.s1).toEqual({ text: 'a2', images: [] });
    });
});
