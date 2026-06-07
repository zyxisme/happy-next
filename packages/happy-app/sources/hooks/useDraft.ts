import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { storage } from '@/sync/storage';
import type { LocalImage } from '@/components/ImagePreview';

interface UseDraftOptions {
    autoSaveInterval?: number; // in milliseconds, default 2000
}

/**
 * Persists the message input as a per-session draft.
 *
 * Strictly one-directional, which is what makes "resurrected drafts" impossible:
 *   - On mount, the persisted draft seeds the input ONCE.
 *   - After that, input changes flow only INTO the draft (debounced), never back.
 *
 * There is deliberately no focus-based restore, no send-in-flight gate, and no
 * suppression window — those existed only to fight a two-way data flow. The draft
 * store (`storage.drafts`, mirrored to the `session-drafts` MMKV key) is the single
 * source of truth; drafts never live on the Session object, so session sync/merge/
 * cache can never write a cleared draft back.
 *
 * Relies on the input owner (SessionViewLoaded) being keyed by sessionId, so this
 * hook's sessionId is constant for its lifetime: the old session's draft is flushed
 * on unmount and the new one is seeded on the next mount.
 */
export function useDraft(
    sessionId: string | null | undefined,
    value: string,
    onChange: (value: string) => void,
    images: LocalImage[],
    onImagesChange: (images: LocalImage[]) => void,
    options: UseDraftOptions = {}
) {
    const { autoSaveInterval = 2000 } = options;
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Always the latest input, so background/unmount flush never reads a stale closure
    // (the root cause of the old resurrection bug).
    const latestRef = useRef({ value, images });
    latestRef.current = { value, images };
    // Guards the one-shot restore so a re-render can't re-seed the input.
    const didInitRef = useRef(false);

    const flush = useCallback((text: string, imgs: LocalImage[]) => {
        if (!sessionId) return;
        // setDraft normalizes an empty draft to a deletion, so flushing "" is a no-op.
        storage.getState().setDraft(sessionId, { text, images: imgs });
    }, [sessionId]);

    // One-shot restore on mount. sessionId never changes during this hook's lifetime,
    // so an empty-ish dep list is correct and avoids re-restoring on every render.
    useEffect(() => {
        if (!sessionId || didInitRef.current) return;
        didInitRef.current = true;
        const draft = storage.getState().drafts[sessionId];
        // Only seed an empty input, so externally-injected text (e.g. resend) is never clobbered.
        if (draft && !value && images.length === 0) {
            if (draft.text) onChange(draft.text);
            if (draft.images.length > 0) onImagesChange(draft.images);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId]);

    // Auto-save: empty<->non-empty persists immediately (keeps the list indicator in
    // sync), ongoing edits debounce. Skipped until the one-shot restore has run.
    useEffect(() => {
        if (!sessionId || !didInitRef.current) return;
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        const isEmpty = !value.trim() && images.length === 0;
        if (isEmpty) {
            flush(value, images);
        } else {
            saveTimeoutRef.current = setTimeout(() => flush(value, images), autoSaveInterval);
        }
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
        };
    }, [value, images, sessionId, autoSaveInterval, flush]);

    // Flush the latest input when the app is backgrounded.
    useEffect(() => {
        if (!sessionId) return;
        const handleAppStateChange = (next: AppStateStatus) => {
            if (next === 'background' || next === 'inactive') {
                flush(latestRef.current.value, latestRef.current.images);
            }
        };
        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => { subscription.remove(); };
    }, [sessionId, flush]);

    // Flush the latest input on unmount (reads the ref, never a stale closure).
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            flush(latestRef.current.value, latestRef.current.images);
        };
    }, [flush]);

    // Clear the draft (used after a message is sent). Cancels any pending debounced
    // save so it can't write the just-sent text back. Does not touch the input — the
    // caller clears that.
    const clearDraft = useCallback(() => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        if (sessionId) {
            storage.getState().setDraft(sessionId, null);
        }
    }, [sessionId]);

    return { clearDraft };
}
