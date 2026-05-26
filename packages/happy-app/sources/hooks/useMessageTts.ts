import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as React from 'react';
import { fetch as expoFetch } from 'expo/fetch';
import { streamSpeech } from '@/sync/apiHappyVoice';
import { setPlaybackAudioMode } from '@/utils/microphonePermissions';
import { isVoiceSessionStarted } from '@/realtime/RealtimeSession';

export type MessageTtsState = 'idle' | 'loading' | 'playing';

// Single active playback across all messages (singleton across mounts).
let currentPlayingId: string | null = null;
const listeners = new Set<() => void>();
function notifyAll() { listeners.forEach(fn => fn()); }

/** Swallow NativeSharedObjectNotFoundException when expo-audio released the player under us. */
function safePlayerCall(fn: () => void) {
    try { fn(); } catch { /* player released; nothing to do */ }
}

/** Write one sentence's mp3 to a cache file and return its uri. */
function writeChunkFile(messageId: string, seq: number, audioBase64: string): string {
    const safeId = messageId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = new File(Paths.cache, `tts-${safeId}-${seq}.mp3`);
    file.create({ overwrite: true, intermediates: true });
    file.write(audioBase64, { encoding: 'base64' });
    return file.uri;
}

/**
 * Native "read message aloud" with progressive playback. The gateway streams
 * sentence-by-sentence mp3 over SSE (read via expo/fetch, since RN's global fetch
 * has no streaming body); each sentence is written to a cache file and queued,
 * and expo-audio plays them in order, starting as soon as the first arrives.
 */
export function useMessageTts(messageId: string, text: string | null | undefined) {
    const [uri, setUri] = React.useState<string | null>(null);
    const [internalState, setInternalState] = React.useState<MessageTtsState>('idle');
    const player = useAudioPlayer(uri || undefined);
    const status = useAudioPlayerStatus(player);
    const [, force] = React.useReducer((x: number) => x + 1, 0);

    const queueRef = React.useRef<string[]>([]);
    const idxRef = React.useRef(0);
    const doneRef = React.useRef(false);
    const stoppedRef = React.useRef(false);
    const startingRef = React.useRef(false);
    const pendingPlayRef = React.useRef(false);
    const abortRef = React.useRef<AbortController | null>(null);

    React.useEffect(() => {
        listeners.add(force);
        return () => { listeners.delete(force); };
    }, []);

    const reset = React.useCallback(() => {
        stoppedRef.current = true;
        abortRef.current?.abort();
        abortRef.current = null;
        safePlayerCall(() => player.pause());
        queueRef.current = [];
        idxRef.current = 0;
        doneRef.current = false;
        pendingPlayRef.current = false;
        setUri(null);
        setInternalState('idle');
    }, [player]);

    // Reset when the message text changes (streamed/edited messages).
    React.useEffect(() => {
        if (currentPlayingId === messageId) { currentPlayingId = null; notifyAll(); }
        reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text]);

    // Pause if another message took over playback.
    React.useEffect(() => {
        if (currentPlayingId !== null && currentPlayingId !== messageId && status.playing) {
            safePlayerCall(() => player.pause());
        }
    }, [messageId, status.playing, player]);

    // Start playback once a newly-set source has loaded.
    // Keyed on `uri` as well as `status.isLoaded`: each sentence's setUri makes
    // useAudioPlayer recreate the native player, and a freshly-created player for
    // a local file can already report isLoaded=true, so the status would go
    // true→true with no transition. Without the `uri` dep the effect would never
    // re-fire and only the first sentence would play. The pendingPlayRef gate
    // keeps this to one play() per source.
    React.useEffect(() => {
        if (pendingPlayRef.current && status.isLoaded && currentPlayingId === messageId) {
            pendingPlayRef.current = false;
            safePlayerCall(() => { player.seekTo(0); player.play(); });
            setInternalState('playing');
            notifyAll();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status.isLoaded, uri, messageId]);

    // Advance to the next sentence when the current one finishes.
    React.useEffect(() => {
        if (!status.didJustFinish || currentPlayingId !== messageId) return;
        idxRef.current += 1;
        if (idxRef.current < queueRef.current.length) {
            pendingPlayRef.current = true;
            setUri(queueRef.current[idxRef.current]);
        } else if (doneRef.current) {
            currentPlayingId = null;
            setInternalState('idle');
            notifyAll();
        } else {
            // caught up; waiting for the next sentence to arrive.
            setInternalState('loading');
            notifyAll();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [status.didJustFinish, messageId]);

    // Clear the global singleton on unmount if this message owned playback.
    React.useEffect(() => {
        return () => {
            if (currentPlayingId === messageId) { currentPlayingId = null; notifyAll(); }
        };
    }, [messageId]);

    const isMine = currentPlayingId === messageId;
    const state: MessageTtsState = isMine ? internalState : 'idle';

    const toggle = React.useCallback(async () => {
        if (!text) return;

        // Active for this message → stop.
        if (isMine && internalState !== 'idle') {
            currentPlayingId = null;
            reset();
            notifyAll();
            return;
        }
        if (startingRef.current) return;

        startingRef.current = true;
        stoppedRef.current = false;
        doneRef.current = false;
        queueRef.current = [];
        idxRef.current = 0;
        currentPlayingId = messageId;
        setInternalState('loading');
        notifyAll();

        // iOS routes playback to the earpiece by default (and the voice flow can
        // leave the session in record mode); force loudspeaker before playing.
        // Skip during an active voice call — switching off recording would cut the
        // call's mic, and the call already routes audio to the loudspeaker.
        if (!isVoiceSessionStarted()) {
            await setPlaybackAudioMode();
        }

        const ac = new AbortController();
        abortRef.current = ac;
        try {
            await streamSpeech(text, (chunk) => {
                if (stoppedRef.current) return;
                const fileUri = writeChunkFile(messageId, chunk.seq, chunk.audioBase64);
                queueRef.current.push(fileUri);
                // First sentence → start; or resume if playback had caught up and was waiting.
                if (queueRef.current.length === 1 || idxRef.current === queueRef.current.length - 1) {
                    pendingPlayRef.current = true;
                    setUri(queueRef.current[idxRef.current]);
                }
            }, ac.signal, expoFetch as unknown as typeof fetch);
            doneRef.current = true;
            // Stream ended with nothing to play (empty / already drained, never started).
            if (currentPlayingId === messageId && queueRef.current.length === 0) {
                currentPlayingId = null;
                setInternalState('idle');
                notifyAll();
            }
        } catch {
            doneRef.current = true;
            if (currentPlayingId === messageId && queueRef.current.length === 0) {
                currentPlayingId = null;
                setInternalState('idle');
                notifyAll();
            }
        } finally {
            startingRef.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [text, isMine, internalState, messageId, reset]);

    return { state, toggle };
}
