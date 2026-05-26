import React, { useEffect, useRef } from 'react';
import {
    RTCManager, ChannelProfile, MessageConfig, AudioRoute,
    type IEngine, type IRoom, type ErrorCode,
} from '@volcengine/react-native-rtc';
import { registerVoiceSession, getSessionVersion, setRealtimeStatusIfCurrent, setRealtimeModeIfCurrent } from './RealtimeSession';
import { storage } from '@/sync/storage';
import { getCurrentLanguage } from '@/text';
import { startHappyVoiceSession, stopHappyVoiceSession } from '@/sync/apiHappyVoice';
import { getWelcomeMessage } from '@/sync/voiceConfig';
import type { VoiceSession, VoiceSessionConfig } from './types';
import { serializeHappyVoiceContext } from './HappyVoiceContextSerializer';
import { buildAgentCommand, cleanForSpeech, parseAgentMessage } from './happyVoiceProtocol';
import { runFunctionCall } from './realtimeFunctionCall';

let manager: RTCManager | null = null;
let engine: IEngine | null = null;
let room: IRoom | null = null;
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
    // RN SDK room/engine calls return synchronous status codes (not Promises,
    // unlike the web @volcengine/rtc SDK), so there is nothing to await here.
    try {
        room?.leaveRoom();
    } catch (error) {
        console.warn('[HappyVoice] leaveRoom failed:', error);
    }
    try {
        engine?.stopAudioCapture();
    } catch { /* ignore */ }
    try {
        manager?.destroyRTCEngine();
    } catch (error) {
        console.warn('[HappyVoice] destroyRTCEngine failed:', error);
    }
    room = null;
    engine = null;
    manager = null;
}

/** Send a control command to the agent over the 'ctrl' channel. */
function sendAgentCommand(command: string, message: string) {
    if (!room || !activeAgentUid) return;
    try {
        room.sendUserBinaryMessage(activeAgentUid, buildAgentCommand(command, message), MessageConfig.RELIABLE_ORDERED);
    } catch (error) {
        console.warn('[HappyVoice] sendAgentCommand failed:', error);
    }
}

function applyMode(version: number, mode: 'thinking' | 'speaking' | 'idle') {
    if (mode === 'thinking') {
        setRealtimeModeIfCurrent(version, 'thinking', true);
        clearThinkingTimeout();
        thinkingTimeoutId = setTimeout(() => {
            thinkingTimeoutId = null;
            if (storage.getState().realtimeMode === 'thinking') {
                setRealtimeModeIfCurrent(version, 'idle', true);
            }
        }, THINKING_TIMEOUT_MS);
    } else if (mode === 'speaking') {
        clearThinkingTimeout();
        setRealtimeModeIfCurrent(version, 'speaking', true);
    } else {
        clearThinkingTimeout();
        setRealtimeModeIfCurrent(version, 'idle', true);
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

            const nextManager = new RTCManager();
            const nextEngine = await nextManager.createRTCEngine({ appID: start.appId });

            // Engine-level events (errors); room-level events are on the room handler below.
            nextEngine.setRtcVideoEventHandler({
                onError: (code: ErrorCode) => console.error('[HappyVoice] RTC error:', code),
            });

            // The chat/communication profile defaults audio output to the earpiece
            // (like a phone call), so the agent's voice is inaudible held normally.
            // Route to the loudspeaker for a hands-free voice assistant.
            nextEngine.setDefaultAudioRoute(AudioRoute.AUDIO_ROUTE_SPEAKERPHONE);

            const nextRoom = nextEngine.createRTCRoom(start.roomId);
            // The AIGC agent broadcasts conv/tool/func binary messages on the room channel.
            const onBinary = (_uid: string, message: ArrayBuffer) => {
                const event = parseAgentMessage(message);
                if (!event) return;
                if (event.kind === 'tool') {
                    runFunctionCall(event.payload, (buf) => {
                        if (room && activeAgentUid) {
                            room.sendUserBinaryMessage(activeAgentUid, buf, MessageConfig.RELIABLE_ORDERED);
                        }
                    }).catch((e) => console.error('[HappyVoice] runFunctionCall failed:', e));
                    return;
                }
                applyMode(version, event.mode);
            };
            nextRoom.setRTCRoomEventHandler({
                onRoomBinaryMessageReceived: onBinary,
            });

            nextRoom.joinRoom({
                token: start.rtcToken,
                userId: start.uid,
                roomConfigs: {
                    profile: ChannelProfile.CHANNEL_PROFILE_CHAT,
                    isAutoPublishAudio: true,
                    isAutoPublishVideo: false,
                    isAutoSubscribeAudio: true,
                    isAutoSubscribeVideo: false,
                },
            });
            nextEngine.startAudioCapture();
            // joinRoom/startAudioCapture are synchronous status-code calls; the room-join
            // result actually arrives asynchronously via onRoomStateChanged. We optimistically
            // mark 'connected' here per the current design. TODO(device-test): if the UI shows
            // 'connected' too early or fails to surface join errors, gate status on
            // onRoomStateChanged instead.

            manager = nextManager;
            engine = nextEngine;
            room = nextRoom;
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
        if (!room) return;
        try {
            room.publishStreamAudio(!muted);
        } catch (error) {
            console.error('[HappyVoice] Failed to set mic muted state:', error);
        }
    }

    sendTextMessage(message: string): void {
        const match = message.match(/^\s*\[\[hv-notify:(\w+)\]\]([\s\S]*)$/);
        const kind = match?.[1] ?? 'ready';
        if (kind === 'ready') {
            if (!lastHappyReply) return;
            const clean = cleanForSpeech(lastHappyReply);
            if (!clean) return;
            const speak = clean.length > 180 ? 'Happy 回复了，详情在屏幕上。' : `Happy 说：${clean}`;
            sendAgentCommand('ExternalTextToSpeech', speak);
        } else {
            const payload = match?.[2] ?? message;
            const tool = payload.match(/use\s+([A-Za-z]+)/)?.[1];
            sendAgentCommand('ExternalTextToSpeech', tool ? `Happy 想使用 ${tool}，要允许吗？` : 'Happy 需要权限，要允许吗？');
        }
    }

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
