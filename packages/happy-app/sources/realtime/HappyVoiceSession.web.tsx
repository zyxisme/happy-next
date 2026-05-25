import React, { useEffect, useRef } from 'react';
import VERTC, { MediaType, RoomProfileType, type IRTCEngine } from '@volcengine/rtc';
import { registerVoiceSession, getSessionVersion, setRealtimeStatusIfCurrent, setRealtimeModeIfCurrent } from './RealtimeSession';
import { storage } from '@/sync/storage';
import { getCurrentLanguage } from '@/text';
import { startHappyVoiceSession, stopHappyVoiceSession } from '@/sync/apiHappyVoice';
import { getWelcomeMessage } from '@/sync/voiceConfig';
import type { VoiceSession, VoiceSessionConfig } from './types';
import { serializeHappyVoiceContext } from './HappyVoiceContextSerializer';
import { realtimeClientTools } from './realtimeClientTools';

type ToolName = keyof typeof realtimeClientTools;

let engine: IRTCEngine | null = null;
let activeGatewaySessionId: string | null = null;
let activeAgentUid: string | null = null;
let lastHappyReply: string | null = null;
let thinkingTimeoutId: ReturnType<typeof setTimeout> | null = null;
const THINKING_TIMEOUT_MS = 15000;

// Volcano AIGC conversation-state codes (binary message type 'conv').
const AGENT_BRIEF = { UNKNOWN: 0, LISTENING: 1, THINKING: 2, SPEAKING: 3, INTERRUPTED: 4, FINISHED: 5 } as const;
// RTC control-message interrupt priority (medium: wait for current turn to end).
const INTERRUPT_MEDIUM = 2;

/** Parse a TLV binary message: | 4-byte magic | 4-byte big-endian length | value |. */
function tlvDecode(buffer: ArrayBuffer): { type: string; value: string } {
    const typeBuffer = new Uint8Array(buffer, 0, 4);
    const lengthBuffer = new Uint8Array(buffer, 4, 4);
    const valueBuffer = new Uint8Array(buffer, 8);
    let type = '';
    for (let i = 0; i < typeBuffer.length; i++) type += String.fromCharCode(typeBuffer[i]);
    const length = (lengthBuffer[0] << 24) | (lengthBuffer[1] << 16) | (lengthBuffer[2] << 8) | lengthBuffer[3];
    const value = new TextDecoder().decode(valueBuffer.subarray(0, length));
    return { type, value };
}

// @volcengine/rtc sendUserBinaryMessage caps each message at 1KB. Tool results
// (e.g. listSessions) can exceed that, so we truncate the given field by byte
// length until the whole JSON payload fits comfortably under the limit.
const RTC_MSG_MAX_BYTES = 980;
function encodeFitting(obj: Record<string, unknown>, truncKey: string, magic: string): ArrayBuffer {
    const enc = new TextEncoder();
    let json = JSON.stringify(obj);
    if (enc.encode(json).length <= RTC_MSG_MAX_BYTES) return tlvEncode(json, magic);
    let val = String(obj[truncKey] ?? '');
    while (val.length > 0) {
        val = val.slice(0, Math.max(0, Math.floor(val.length * 0.85) - 1));
        json = JSON.stringify({ ...obj, [truncKey]: val ? `${val}…` : '' });
        if (enc.encode(json).length <= RTC_MSG_MAX_BYTES) break;
    }
    return tlvEncode(json, magic);
}

/** Wrap a string into a TLV buffer with the given 4-char magic (e.g. 'func', 'ctrl'). */
function tlvEncode(str: string, type: string): ArrayBuffer {
    const typeBuffer = new Uint8Array(4);
    for (let i = 0; i < type.length; i++) typeBuffer[i] = type.charCodeAt(i);
    const valueBuffer = new TextEncoder().encode(str);
    const len = valueBuffer.length;
    const tlv = new Uint8Array(8 + len);
    tlv.set(typeBuffer, 0);
    tlv[4] = (len >> 24) & 0xff;
    tlv[5] = (len >> 16) & 0xff;
    tlv[6] = (len >> 8) & 0xff;
    tlv[7] = len & 0xff;
    tlv.set(valueBuffer, 8);
    return tlv.buffer;
}

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

/** Make TTS-safe text from an agent reply: strip markup/code, collapse whitespace. */
function cleanForSpeech(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[*#_>~|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Send a control command to the agent (interrupt / ExternalTextToSpeech / ExternalTextToLLM). */
function sendAgentCommand(command: string, message: string) {
    if (!engine || !activeAgentUid) return;
    try {
        engine.sendUserBinaryMessage(
            activeAgentUid,
            encodeFitting({ Command: command, InterruptMode: INTERRUPT_MEDIUM, Message: message }, 'Message', 'ctrl'),
        );
    } catch (error) {
        console.warn('[HappyVoice] sendAgentCommand failed:', error);
    }
}

/** Execute a function call from the agent and return the result over the 'func' channel. */
async function handleFunctionCall(parsed: any) {
    const calls = Array.isArray(parsed?.tool_calls) ? parsed.tool_calls : [];
    for (const call of calls) {
        const id = call?.id;
        const name = call?.function?.name as ToolName | undefined;
        let args: unknown = {};
        try {
            args = JSON.parse(call?.function?.arguments || '{}');
        } catch {
            args = {};
        }
        let content = 'error (unknown tool)';
        const impl = name ? realtimeClientTools[name] : undefined;
        if (impl) {
            try {
                content = await (impl as (p: unknown) => Promise<string>)(args);
            } catch (error) {
                content = `error (${error instanceof Error ? error.message : String(error)})`;
            }
        }
        if (engine && activeAgentUid) {
            engine.sendUserBinaryMessage(
                activeAgentUid,
                encodeFitting({ ToolCallID: id, Content: content }, 'Content', 'func'),
            );
        }
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
                let decoded: { type: string; value: string };
                try {
                    decoded = tlvDecode(e.message);
                } catch {
                    return;
                }
                const { type, value } = decoded;
                if (type === 'tool') {
                    // Function call from the agent → execute client-side, return result.
                    try {
                        void handleFunctionCall(JSON.parse(value));
                    } catch {}
                    return;
                }
                if (type === 'conv') {
                    try {
                        const code = JSON.parse(value)?.Stage?.Code;
                        if (code === AGENT_BRIEF.THINKING) {
                            setRealtimeModeIfCurrent(version, 'thinking', true);
                            clearThinkingTimeout();
                            thinkingTimeoutId = setTimeout(() => {
                                thinkingTimeoutId = null;
                                if (storage.getState().realtimeMode === 'thinking') {
                                    setRealtimeModeIfCurrent(version, 'idle', true);
                                }
                            }, THINKING_TIMEOUT_MS);
                        } else if (code === AGENT_BRIEF.SPEAKING) {
                            clearThinkingTimeout();
                            setRealtimeModeIfCurrent(version, 'speaking', true);
                        } else if (code === AGENT_BRIEF.LISTENING || code === AGENT_BRIEF.FINISHED || code === AGENT_BRIEF.INTERRUPTED) {
                            clearThinkingTimeout();
                            setRealtimeModeIfCurrent(version, 'idle', true);
                        }
                    } catch {}
                }
                // 'subv' (subtitles) are available too but not surfaced in the UI yet.
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
            const clean = cleanForSpeech(lastHappyReply);
            if (!clean) return;
            const speak = clean.length > 180 ? 'Happy 回复了，详情在屏幕上。' : `Happy 说：${clean}`;
            sendAgentCommand('ExternalTextToSpeech', speak);
        } else {
            // permission: announce briefly and wait for the user's allow/deny.
            const payload = match?.[2] ?? message;
            const tool = payload.match(/use\s+([A-Za-z]+)/)?.[1];
            sendAgentCommand('ExternalTextToSpeech', tool ? `Happy 想使用 ${tool}，要允许吗？` : 'Happy 需要权限，要允许吗？');
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
