import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as React from 'react';
import { synthesizeSpeech } from '@/sync/apiHappyVoice';

export type MessageTtsState = 'idle' | 'loading' | 'playing';

// Global state: which message id is currently playing (singleton across mounts).
let currentPlayingId: string | null = null;
const listeners = new Set<() => void>();
function notifyAll() { listeners.forEach(fn => fn()); }

/**
 * expo-audio releases a player's native shared object when its source changes (or
 * on unmount). Calling a method on a released player throws
 * NativeSharedObjectNotFoundException, so all imperative calls are wrapped to
 * swallow that race rather than crash the app.
 */
function safePlayerCall(fn: () => void) {
    try {
        fn();
    } catch {
        // Player was released underneath us; nothing to do.
    }
}

/** Turn synthesized base64 audio into a playable URI (data URI on web, cache file on native). */
async function writeAudioUri(messageId: string, audioBase64: string, mimeType: string): Promise<string> {
    if (Platform.OS === 'web') {
        return `data:${mimeType};base64,${audioBase64}`;
    }
    const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = new File(Paths.cache, `tts-${safeId}.wav`);
    file.create({ overwrite: true, intermediates: true });
    file.write(audioBase64, { encoding: 'base64' });
    return file.uri;
}

/**
 * Text-to-speech playback for a single message.
 * Synthesizes once (cached by URI), plays via expo-audio, and enforces a single
 * active playback across all messages.
 */
export function useMessageTts(messageId: string, text: string | null | undefined) {
    const [uri, setUri] = React.useState<string | null>(null);
    const [loading, setLoading] = React.useState(false);
    const loadingRef = React.useRef(false);
    // Set when synthesis just produced a uri: play as soon as the (newly created)
    // player finishes loading the source. See the isLoaded effect below.
    const pendingPlayRef = React.useRef(false);
    const player = useAudioPlayer(uri || undefined);
    const status = useAudioPlayerStatus(player);
    const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0);

    // Re-render when the global playing id changes.
    React.useEffect(() => {
        listeners.add(forceUpdate);
        return () => { listeners.delete(forceUpdate); };
    }, []);

    // Invalidate cached audio if the message text changes (e.g. streamed/edited messages).
    React.useEffect(() => {
        setUri(null);
        pendingPlayRef.current = false;
    }, [text]);

    // Pause if another message took over playback.
    React.useEffect(() => {
        if (currentPlayingId !== null && currentPlayingId !== messageId && status.playing) {
            safePlayerCall(() => player.pause());
        }
    }, [currentPlayingId, messageId, status.playing, player]);

    const isPlaying = status.playing && currentPlayingId === messageId;
    const state: MessageTtsState = loading ? 'loading' : (isPlaying ? 'playing' : 'idle');

    const toggle = React.useCallback(async () => {
        if (!text) return;
        if (isPlaying) {
            safePlayerCall(() => player.pause());
            currentPlayingId = null;
            notifyAll();
            return;
        }
        if (uri) {
            currentPlayingId = messageId;
            safePlayerCall(() => { player.seekTo(0); player.play(); });
            notifyAll();
            return;
        }
        if (loadingRef.current) return;
        loadingRef.current = true;
        setLoading(true);
        try {
            const { audioBase64, mimeType } = await synthesizeSpeech(text);
            const newUri = await writeAudioUri(messageId, audioBase64, mimeType);
            currentPlayingId = messageId;
            pendingPlayRef.current = true;
            setUri(newUri); // effect below starts playback once the new player has loaded
            notifyAll();
        } catch {
            // Never surface loading errors; reset to idle so the user can retry.
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [text, isPlaying, uri, player, messageId]);

    // Changing the source makes expo-audio create a brand-new player whose audio
    // is not loaded synchronously. Calling play() right after setUri() is a no-op,
    // so we wait for the new player to report isLoaded before starting playback.
    // pendingPlayRef gates this to a single play per synthesis (no replay on later
    // status ticks).
    React.useEffect(() => {
        if (pendingPlayRef.current && status.isLoaded && currentPlayingId === messageId) {
            pendingPlayRef.current = false;
            safePlayerCall(() => { player.seekTo(0); player.play(); });
            notifyAll();
        }
    }, [status.isLoaded, currentPlayingId, messageId, player]);

    // Clear singleton when playback finishes.
    React.useEffect(() => {
        if (status.didJustFinish && currentPlayingId === messageId) {
            currentPlayingId = null;
            notifyAll();
        }
    }, [status.didJustFinish, messageId]);

    // Clear the global singleton on unmount if this message owned playback.
    // Keyed on [messageId] only (NOT player): expo-audio swaps the player instance
    // whenever the source changes, and including it here would run this cleanup on
    // every swap — pausing an already-released player (crash) and wrongly clearing
    // currentPlayingId. We also don't call player.pause(): expo-audio's release()
    // on unmount stops the audio, and the player may already be released.
    React.useEffect(() => {
        return () => {
            if (currentPlayingId === messageId) {
                currentPlayingId = null;
                notifyAll();
            }
        };
    }, [messageId]);

    return { state, toggle };
}
