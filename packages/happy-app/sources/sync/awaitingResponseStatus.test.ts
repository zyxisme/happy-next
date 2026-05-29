import { describe, it, expect } from 'vitest';

/**
 * Tests the pure logic behind the optimistic "awaiting response" (processing…)
 * status. Mirrors two pieces of real code (kept in sync by convention, same as
 * thinkingStateMerge.test.ts):
 *
 *  1. applySessions merge in storage.ts — when to keep vs. drop the marker.
 *  2. the awaiting branch in useSessionStatus (sessionUtils.ts) — precedence and
 *     the 120s lazy-expiry window.
 */

const AWAITING_RESPONSE_MAX_MS = 120_000;

// Mirrors storage.ts applySessions: drop the marker once the CLI is thinking or
// the session went offline; otherwise preserve it across routine refreshes.
function mergeAwaiting(
    mergedThinking: boolean,
    resolvedActive: boolean,
    existingMarker: number | null,
): number | null {
    return (mergedThinking || resolvedActive === false) ? null : (existingMarker ?? null);
}

// Mirrors the awaiting branch condition in useSessionStatus.
function isAwaitingActive(awaitingResponseSince: number | null, now: number): boolean {
    return awaitingResponseSince != null
        && now - awaitingResponseSince < AWAITING_RESPONSE_MAX_MS;
}

// Mirrors the relevant precedence order in useSessionStatus:
// disconnected > permission_required > thinking > awaiting > waiting.
type State = 'disconnected' | 'permission_required' | 'thinking' | 'awaiting' | 'waiting';
function resolveState(input: {
    isOnline: boolean;
    hasPermissions: boolean;
    thinking: boolean;
    awaitingResponseSince: number | null;
    now: number;
}): State {
    if (!input.isOnline) return 'disconnected';
    if (input.hasPermissions) return 'permission_required';
    if (input.thinking) return 'thinking';
    if (isAwaitingActive(input.awaitingResponseSince, input.now)) return 'awaiting';
    return 'waiting';
}

describe('awaiting-response marker merge (applySessions logic)', () => {
    it('preserves the marker on a routine refresh (not thinking, still online)', () => {
        expect(mergeAwaiting(false, true, 1000)).toBe(1000);
    });

    it('drops the marker once the CLI is thinking', () => {
        expect(mergeAwaiting(true, true, 1000)).toBeNull();
    });

    it('drops the marker when the session goes offline', () => {
        expect(mergeAwaiting(false, false, 1000)).toBeNull();
    });

    it('stays null when there was no marker', () => {
        expect(mergeAwaiting(false, true, null)).toBeNull();
    });
});

describe('awaiting-response display window (useSessionStatus logic)', () => {
    it('is active right after sending', () => {
        expect(isAwaitingActive(10_000, 10_500)).toBe(true);
    });

    it('lazily expires after 120s', () => {
        expect(isAwaitingActive(0, AWAITING_RESPONSE_MAX_MS)).toBe(false);
        expect(isAwaitingActive(0, AWAITING_RESPONSE_MAX_MS - 1)).toBe(true);
    });

    it('is inactive when no marker is set', () => {
        expect(isAwaitingActive(null, 50_000)).toBe(false);
    });
});

describe('awaiting-response status precedence (useSessionStatus logic)', () => {
    const now = 50_000;
    const base = { isOnline: true, hasPermissions: false, thinking: false, awaitingResponseSince: 49_000, now };

    it('shows awaiting when only the marker is set', () => {
        expect(resolveState(base)).toBe('awaiting');
    });

    it('real thinking takes precedence over the optimistic marker', () => {
        expect(resolveState({ ...base, thinking: true })).toBe('thinking');
    });

    it('offline takes precedence over the optimistic marker', () => {
        expect(resolveState({ ...base, isOnline: false })).toBe('disconnected');
    });

    it('permission request takes precedence over the optimistic marker', () => {
        expect(resolveState({ ...base, hasPermissions: true })).toBe('permission_required');
    });

    it('falls back to waiting once the marker has expired', () => {
        expect(resolveState({ ...base, awaitingResponseSince: now - AWAITING_RESPONSE_MAX_MS })).toBe('waiting');
    });
});
