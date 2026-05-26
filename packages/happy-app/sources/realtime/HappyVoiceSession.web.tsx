import React, { useEffect, useRef } from 'react';
import VERTC, { MediaType, RoomProfileType, type IRTCEngine } from '@volcengine/rtc';
import { registerVoiceSession, getSessionVersion, setRealtimeStatusIfCurrent, setRealtimeModeIfCurrent } from './RealtimeSession';
import { storage } from '@/sync/storage';
import { getCurrentLanguage, t } from '@/text';
import { startHappyVoiceSession, stopHappyVoiceSession, cleanSpeechText } from '@/sync/apiHappyVoice';
import { getWelcomeMessage } from '@/sync/voiceConfig';
import type { VoiceSession, VoiceSessionConfig } from './types';
import { serializeHappyVoiceContext } from './HappyVoiceContextSerializer';
import { buildAgentCommand, parseAgentMessage } from './happyVoiceProtocol';
import { runFunctionCall } from './realtimeFunctionCall';

let engine: IRTCEngine | null = null;
let activeGatewaySessionId: string | null = null;
let activeAgentUid: string | null = null;
let lastHappyReply: string | null = null;
let thinkingTimeoutId: ReturnType<typeof setTimeout> | null = null;
const THINKING_TIMEOUT_MS = 15000;

function clearThinkingTimeout() {
    if (thinkingTimeoutId) {
        clearTimeout(thinkingTimeoutId);
        thinkingTimeoutId = null;
    }
}

async function teardownEngine() {
    clearThinkingTimeout();
    if (engine) {
        try {
            await engine.stopAudioCapture().catch(() => {});
            await engine.leaveRoom().catch(() => {});
            VERTC.destroyEngine(engine);
        } catch (error) {
            console.warn('[HappyVoice] teardown failed:', error);
        }
        engine = null;
    }
}

/** Send a control command to the agent (interrupt / ExternalTextToSpeech / ExternalTextToLLM). */
function sendAgentCommand(command: string, message: string) {
    if (!engine || !activeAgentUid) return;
    try {
        engine.sendUserBinaryMessage(activeAgentUid, buildAgentCommand(command, message));
    } catch (error) {
        console.warn('[HappyVoice] sendAgentCommand failed:', error);
    }
}

class HappyVoiceSessionImpl implements VoiceSession {
    async startSession(config: VoiceSessionConfig): Promise<void> {
        const version = getSessionVersion();
        try {
            setRealtimeStatusIfCurrent(version, 'connecting');
            await teardownEngine();
            lastHappyReply = null;

            const language = storage.getState().settings.voiceAssistantLanguage || getCurrentLanguage();
            const initialContextPayload = config.initialContext
                ? serializeHappyVoiceContext(config.initialContext)
                : undefined;
            const welcomeMessage = getWelcomeMessage();

            const start = await startHappyVoiceSession(
                config.sessionId,
                initialContextPayload,
                language,
                welcomeMessage,
            );

            const nextEngine = VERTC.createEngine(start.appId);

            nextEngine.on(VERTC.events.onError, (e) => console.error('[HappyVoice] RTC error:', e));

            nextEngine.on(VERTC.events.onRoomBinaryMessageReceived, (e: { userId: string; message: ArrayBuffer }) => {
                const event = parseAgentMessage(e.message);
                if (!event) return;
                if (event.kind === 'tool') {
                    void runFunctionCall(event.payload, (buf) => {
                        if (engine && activeAgentUid) engine.sendUserBinaryMessage(activeAgentUid, buf);
                    });
                    return;
                }
                // event.kind === 'mode'
                if (event.mode === 'thinking') {
                    setRealtimeModeIfCurrent(version, 'thinking', true);
                    clearThinkingTimeout();
                    thinkingTimeoutId = setTimeout(() => {
                        thinkingTimeoutId = null;
                        if (storage.getState().realtimeMode === 'thinking') {
                            setRealtimeModeIfCurrent(version, 'idle', true);
                        }
                    }, THINKING_TIMEOUT_MS);
                } else if (event.mode === 'speaking') {
                    clearThinkingTimeout();
                    setRealtimeModeIfCurrent(version, 'speaking', true);
                } else {
                    clearThinkingTimeout();
                    setRealtimeModeIfCurrent(version, 'idle', true);
                }
            });

            nextEngine.on(VERTC.events.onAutoplayFailed, () => {
                const resume = () => {
                    try {
                        (nextEngine as unknown as { play?: () => void }).play?.();
                    } catch {}
                    window.removeEventListener('pointerdown', resume);
                };
                window.addEventListener('pointerdown', resume, { once: true });
            });

            await nextEngine.joinRoom(
                start.rtcToken,
                start.roomId,
                { userId: start.uid },
                { isAutoPublish: true, isAutoSubscribeAudio: true, roomProfileType: RoomProfileType.chat },
            );
            await nextEngine.startAudioCapture();

            engine = nextEngine;
            activeGatewaySessionId = start.gatewaySessionId;
            activeAgentUid = start.agentUid;
            setRealtimeStatusIfCurrent(version, 'connected');
            setRealtimeModeIfCurrent(version, 'idle', true);
        } catch (error) {
            console.error('[HappyVoice] Failed to start session:', error);
            await teardownEngine();
            setRealtimeStatusIfCurrent(version, 'error');
        }
    }

    async endSession(): Promise<void> {
        const gatewaySessionId = activeGatewaySessionId;
        activeGatewaySessionId = null;
        activeAgentUid = null;
        lastHappyReply = null;

        await teardownEngine();

        if (gatewaySessionId) {
            stopHappyVoiceSession(gatewaySessionId).catch((error) => {
                console.warn('[HappyVoice] Failed to stop gateway session:', error);
            });
        }

        storage.getState().setRealtimeStatus('disconnected');
        storage.getState().setRealtimeMode('idle', true);
        storage.getState().clearRealtimeModeDebounce();
    }

    async setMicrophoneMuted(muted: boolean): Promise<void> {
        if (!engine) return;
        try {
            if (muted) {
                await engine.unpublishStream(MediaType.AUDIO);
            } else {
                await engine.publishStream(MediaType.AUDIO);
            }
        } catch (error) {
            console.error('[HappyVoice] Failed to set mic muted state:', error);
        }
    }

    // Speak-only notification (ready / permission). Marked [[hv-notify:<kind>]] by voiceHooks.
    // We drive TTS directly (ExternalTextToSpeech) so the LLM is not re-invoked → no re-forward.
    sendTextMessage(message: string): void {
        const match = message.match(/^\s*\[\[hv-notify:(\w+)\]\]([\s\S]*)$/);
        const kind = match?.[1] ?? 'ready';
        if (kind === 'ready') {
            if (!lastHappyReply) return;
            const reply = lastHappyReply;
            void (async () => {
                const cleaned = (await cleanSpeechText(reply)).trim();
                if (!cleaned) return;
                const MAX_SPOKEN = 1000;
                const body = cleaned.length > MAX_SPOKEN ? `${cleaned.slice(0, MAX_SPOKEN)}……` : cleaned;
                sendAgentCommand('ExternalTextToSpeech', t('voiceAssistant.happySays', { text: body }));
            })();
        } else {
            // permission: announce briefly and wait for the user's allow/deny.
            const payload = match?.[2] ?? message;
            const tool = payload.match(/use\s+([A-Za-z]+)/)?.[1];
            sendAgentCommand('ExternalTextToSpeech', tool ? t('voiceAssistant.happyWantsTool', { tool }) : t('voiceAssistant.happyNeedsPermission'));
        }
    }

    // Passive app context (Happy's messages). Store the latest agent reply so a
    // subsequent ready notification can relay it; do not trigger speech here.
    sendContextualUpdate(update: string): void {
        try {
            const obj = JSON.parse(update) as { messages?: Array<{ role?: string; text?: string }> };
            const agentTexts = (obj?.messages ?? [])
                .filter((m) => m?.role === 'agent' && typeof m.text === 'string')
                .map((m) => m.text as string);
            if (agentTexts.length > 0) {
                lastHappyReply = agentTexts[agentTexts.length - 1];
            }
        } catch {
            // non-JSON context — ignore for speech purposes
        }
    }
}

export const HappyVoiceSession: React.FC = () => {
    const hasRegistered = useRef(false);

    useEffect(() => {
        if (!hasRegistered.current) {
            registerVoiceSession(new HappyVoiceSessionImpl());
            hasRegistered.current = true;
        }
    }, []);

    return null;
};
