import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as React from 'react';

// Global single-playback coordination across ALL preview instances (list rows AND
// the detail sheet). Keyed by a unique per-instance id — not by voiceType — so that
// two instances of the *same* voice (e.g. a list row and the detail sheet) still stop
// each other instead of playing simultaneously.
let activeId: string | null = null;
const listeners = new Set<() => void>();
const deactivators = new Map<string, () => void>();
function notifyAll() { listeners.forEach((fn) => fn()); }

/** Swallow NativeSharedObjectNotFoundException when expo-audio released the player under us. */
function safePlayerCall(fn: () => void) {
    try { fn(); } catch { /* player released; nothing to do */ }
}

// Give up the loading spinner after this long (slow/failed network) so it can't spin forever.
const LOAD_TIMEOUT_MS = 15000;

let idCounter = 0;

/**
 * Plays a voice's remote trial/preview audio (TrialURL). Only one preview plays at a
 * time across the whole app; starting one stops every other instance. Tapping again
 * toggles play/pause. Between the tap and audio actually starting (remote URL still
 * loading) it reports `loading` so the UI can show a spinner instead of a frozen icon.
 */
export function useVoicePreview(key: string, url: string | undefined) {
    const idRef = React.useRef<string>('');
    if (!idRef.current) idRef.current = `${key}#${++idCounter}`;
    const id = idRef.current;

    const player = useAudioPlayer(url || undefined);
    const status = useAudioPlayerStatus(player);
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);
    const [loading, setLoading] = React.useState(false);
    const loadTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearLoadTimer = React.useCallback(() => {
        if (loadTimer.current) {
            clearTimeout(loadTimer.current);
            loadTimer.current = null;
        }
    }, []);

    // Pause this instance and drop its spinner. Kept in a ref so the registry always
    // calls the latest version (player can be recreated when url changes).
    const pauseSelf = React.useCallback(() => {
        safePlayerCall(() => player.pause());
        setLoading(false);
        clearLoadTimer();
    }, [player, clearLoadTimer]);
    const pauseSelfRef = React.useRef(pauseSelf);
    pauseSelfRef.current = pauseSelf;

    // Register this instance globally for cross-instance coordination + re-renders.
    React.useEffect(() => {
        listeners.add(forceUpdate);
        deactivators.set(id, () => pauseSelfRef.current());
        return () => {
            listeners.delete(forceUpdate);
            deactivators.delete(id);
            if (activeId === id) activeId = null;
            pauseSelfRef.current();
        };
    }, [id]);

    // Once playback actually starts, or this instance is no longer active, drop the spinner.
    React.useEffect(() => {
        if ((status.playing && activeId === id) || activeId !== id) {
            setLoading(false);
            clearLoadTimer();
        }
    }, [status.playing, activeId, id, clearLoadTimer]);

    const isPlaying = activeId === id;

    const toggle = React.useCallback(() => {
        if (!url) return;
        if (activeId === id || loading) {
            // Stop (or cancel a pending load) for this instance.
            pauseSelf();
            if (activeId === id) activeId = null;
            notifyAll();
        } else {
            // Stop every other instance, then take over.
            deactivators.forEach((deactivate, otherId) => {
                if (otherId !== id) deactivate();
            });
            activeId = id;
            setLoading(true);
            clearLoadTimer();
            loadTimer.current = setTimeout(() => {
                setLoading(false);
                if (activeId === id && !status.playing) {
                    activeId = null;
                    notifyAll();
                }
            }, LOAD_TIMEOUT_MS);
            safePlayerCall(() => { player.seekTo(0); player.play(); });
            notifyAll();
        }
    }, [id, loading, player, url, status.playing, pauseSelf, clearLoadTimer]);

    // Clear active state when playback finishes naturally.
    React.useEffect(() => {
        if (status.didJustFinish && activeId === id) {
            activeId = null;
            notifyAll();
        }
    }, [status.didJustFinish, id]);

    return { isPlaying, loading, toggle };
}
