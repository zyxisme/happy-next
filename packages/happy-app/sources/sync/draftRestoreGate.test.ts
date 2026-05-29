import { describe, it, expect } from 'vitest';

/**
 * Tests the draft-restore gate in useDraft.ts (load effect). Mirrors the guard
 * logic (kept in sync by convention, like thinkingStateMerge.test.ts).
 *
 * Root cause this guards against: the composed draft is written to storage while
 * typing and only cleared after a send succeeds. During the (hedge-widened)
 * in-flight window, leaving and re-entering the chat mounts a fresh useDraft
 * whose input is empty — without the in-flight guard it would restore the draft
 * of the message currently being sent, resurrecting just-cleared text.
 */

function shouldRestoreDraftText(input: {
    isFocused: boolean;
    suppressed: boolean;
    sendInFlight: boolean;
    hasDraft: boolean;
    valueEmpty: boolean;
}): boolean {
    if (!input.isFocused) return false;
    if (input.suppressed) return false;
    if (input.sendInFlight) return false;
    if (!input.hasDraft) return false;
    return input.valueEmpty;
}

const base = {
    isFocused: true,
    suppressed: false,
    sendInFlight: false,
    hasDraft: true,
    valueEmpty: true,
};

describe('draft restore gate (useDraft load effect)', () => {
    it('restores when focused, not suppressed, not sending, draft exists, input empty', () => {
        expect(shouldRestoreDraftText(base)).toBe(true);
    });

    it('does NOT restore while a send is in flight for the session (the bug)', () => {
        expect(shouldRestoreDraftText({ ...base, sendInFlight: true })).toBe(false);
    });

    it('does NOT restore when suppressed (post-clear window)', () => {
        expect(shouldRestoreDraftText({ ...base, suppressed: true })).toBe(false);
    });

    it('does NOT restore when not focused', () => {
        expect(shouldRestoreDraftText({ ...base, isFocused: false })).toBe(false);
    });

    it('does NOT restore when there is no draft', () => {
        expect(shouldRestoreDraftText({ ...base, hasDraft: false })).toBe(false);
    });

    it('does NOT overwrite a non-empty input', () => {
        expect(shouldRestoreDraftText({ ...base, valueEmpty: false })).toBe(false);
    });

    it('restores again once the send settles (in-flight cleared) and a draft remains', () => {
        // Failure path: send settled, draft was never cleared → recoverable.
        expect(shouldRestoreDraftText({ ...base, sendInFlight: false })).toBe(true);
    });
});
