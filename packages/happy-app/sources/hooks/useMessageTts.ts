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
    }, [text]);

    // Pause if another message took over playback.
    React.useEffect(() => {
        if (currentPlayingId !== null && currentPlayingId !== messageId && status.playing) {
            player.pause();
        }
    }, [currentPlayingId, messageId, status.playing, player]);

    const isPlaying = status.playing && currentPlayingId === messageId;
    const state: MessageTtsState = loading ? 'loading' : (isPlaying ? 'playing' : 'idle');

    const toggle = React.useCallback(async () => {
        if (!text) return;
        if (isPlaying) {
            player.pause();
            currentPlayingId = null;
            notifyAll();
            return;
        }
        if (uri) {
            currentPlayingId = messageId;
            player.seekTo(0);
            player.play();
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
            setUri(newUri); // effect below starts playback once the source is set
            notifyAll();
        } catch {
            // Never surface loading errors; reset to idle so the user can retry.
        } finally {
            loadingRef.current = false;
            setLoading(false);
        }
    }, [text, isPlaying, uri, player, messageId]);

    // Once a freshly-synthesized uri is set and this message is the designated one, play it.
    React.useEffect(() => {
        if (uri && currentPlayingId === messageId && !status.playing) {
            player.seekTo(0);
            player.play();
            notifyAll();
        }
        // Intentionally keyed on [uri] only: including status.playing/player/messageId
        // would re-trigger play() on every status tick (e.g. replay after pause).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [uri]);

    // Clear singleton when playback finishes.
    React.useEffect(() => {
        if (status.didJustFinish && currentPlayingId === messageId) {
            currentPlayingId = null;
            notifyAll();
        }
    }, [status.didJustFinish, messageId]);

    // Stop on unmount if this message was playing.
    React.useEffect(() => {
        return () => {
            if (currentPlayingId === messageId) {
                player.pause();
                currentPlayingId = null;
                notifyAll();
            }
        };
    }, [messageId, player]);

    return { state, toggle };
}
