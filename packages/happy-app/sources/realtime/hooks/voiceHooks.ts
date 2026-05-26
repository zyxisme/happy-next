import { getVoiceSession, isVoiceSessionStarted, setCurrentRealtimeSessionId } from '../RealtimeSession';
import {
    formatNewMessages,
    formatPermissionRequest,
    formatReadyEvent,
    formatSessionFull,
    formatSessionOffline,
    formatSessionOnline
} from './contextFormatters';
import { storage, getSession } from '@/sync/storage';
import { Message } from '@/sync/typesMessage';
import { VOICE_CONFIG } from '../voiceConfig';

/**
 * Centralized voice assistant hooks for multi-session context updates.
 * These hooks route app events to the voice assistant with formatted context updates.
 */

interface SessionMetadata {
    summary?: { text?: string };
    path?: string;
    machineId?: string;
    [key: string]: any;
}

let shownSessions = new Set<string>();
let lastFocusSession: string | null = null;

function reportContextualUpdate(update: string | null | undefined) {
    if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('🎤 Voice: Reporting contextual update:', update);
    }
    if (!update) return;
    const voice = getVoiceSession();
    if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('🎤 Voice: Voice session:', voice);
    }
    if (!voice || !isVoiceSessionStarted()) return;
    voice.sendContextualUpdate(update);
}

// Marks injected text as a speak-only notification (ready / permission) so the
// Happy Voice gateway routes it to a tools-disabled turn instead of the main
// (forward-capable) flow. Keep "hv-notify" in sync with happy-voice llmProxy.ts.
type VoiceNotifyKind = 'ready' | 'permission';
function reportTextUpdate(update: string | null | undefined, kind: VoiceNotifyKind = 'ready') {
    if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('🎤 Voice: Reporting text update:', kind, update);
    }
    if (!update) return;
    const voice = getVoiceSession();
    if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
        console.log('🎤 Voice: Voice session:', voice);
    }
    if (!voice || !isVoiceSessionStarted()) return;
    voice.sendTextMessage(`[[hv-notify:${kind}]]${update}`);
}

function reportSession(sessionId: string) {
    if (shownSessions.has(sessionId)) return;
    shownSessions.add(sessionId);
    const session = getSession(sessionId);
    if (!session) return;
    const messages = storage.getState().sessionMessages[sessionId]?.messages ?? [];
    const contextUpdate = formatSessionFull(session, messages);
    reportContextualUpdate(contextUpdate);
}

export const voiceHooks = {

    /**
     * Called when a session comes online/connects
     */
    onSessionOnline(sessionId: string, metadata?: SessionMetadata) {
        if (VOICE_CONFIG.DISABLE_SESSION_STATUS) return;
        
        reportSession(sessionId);
        const contextUpdate = formatSessionOnline(sessionId, metadata);
        reportContextualUpdate(contextUpdate);
    },

    /**
     * Called when a session goes offline/disconnects
     */
    onSessionOffline(sessionId: string, metadata?: SessionMetadata) {
        if (VOICE_CONFIG.DISABLE_SESSION_STATUS) return;
        
        reportSession(sessionId);
        const contextUpdate = formatSessionOffline(sessionId, metadata);
        reportContextualUpdate(contextUpdate);
    },


    /**
     * Called when user navigates to/views a session
     */
    onSessionFocus(sessionId: string, metadata?: SessionMetadata) {
        if (VOICE_CONFIG.DISABLE_SESSION_FOCUS) return;
        if (lastFocusSession === sessionId) return;
        lastFocusSession = sessionId;
        setCurrentRealtimeSessionId(sessionId);
        // Happy Voice treats focus as a hard context switch.
        // Force re-sending a full snapshot so downstream can replace old session context.
        shownSessions.delete(sessionId);
        reportSession(sessionId);
    },

    /**
     * Called when user leaves a session (e.g. navigates back to home)
     */
    onSessionBlur() {
        lastFocusSession = null;
    },

    /**
     * Called when the agent requests permission for a tool use
     */
    onPermissionRequested(sessionId: string, requestId: string, toolName: string, toolArgs: any) {
        if (VOICE_CONFIG.DISABLE_PERMISSION_REQUESTS) return;

        if (sessionId !== lastFocusSession) {
            reportTextUpdate(`background-session-permission:${sessionId}`, 'permission');
            return;
        }
        reportSession(sessionId);
        reportTextUpdate(formatPermissionRequest(sessionId, requestId, toolName, toolArgs), 'permission');
    },

    /**
     * Called when the agent sends a message/response
     */
    onMessages(sessionId: string, messages: Message[]) {
        if (VOICE_CONFIG.DISABLE_MESSAGES) return;
        if (sessionId !== lastFocusSession) return;

        reportSession(sessionId);
        reportContextualUpdate(formatNewMessages(sessionId, messages));
    },

    /**
     * Called when voice session starts
     */
    onVoiceStarted(sessionId: string): string {
        if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('🎤 Voice session started for:', sessionId);
        }
        shownSessions.clear();
        lastFocusSession = sessionId;
        let prompt = '';
        const session = getSession(sessionId);
        if (!session) return prompt;
        const messages = storage.getState().sessionMessages[sessionId]?.messages ?? [];
        prompt += formatSessionFull(session, messages);
        shownSessions.add(sessionId);
        // prompt += 'Another active sessions: \n\n';
        // for (let s of storage.getState().getActiveSessions()) {
        //     if (s.id === sessionId) continue;
        //     prompt += formatSessionFull(s, storage.getState().sessionMessages[s.id]?.messages ?? []);
        // }
        return prompt;
    },

    /**
     * Called when the agent finishes processing (ready event)
     */
    onReady(sessionId: string) {
        if (VOICE_CONFIG.DISABLE_READY_EVENTS) return;

        if (sessionId !== lastFocusSession) {
            reportTextUpdate(`background-session-ready:${sessionId}`, 'ready');
            return;
        }
        reportSession(sessionId);
        reportTextUpdate(formatReadyEvent(sessionId), 'ready');
    },

    /**
     * Called when voice session stops
     */
    onVoiceStopped() {
        if (VOICE_CONFIG.ENABLE_DEBUG_LOGGING) {
            console.log('🎤 Voice session stopped');
        }
        shownSessions.clear();
    }
};
