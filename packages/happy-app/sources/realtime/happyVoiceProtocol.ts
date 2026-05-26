// Volcano AIGC conversation-state codes (binary message type 'conv').
export const AGENT_BRIEF = { UNKNOWN: 0, LISTENING: 1, THINKING: 2, SPEAKING: 3, INTERRUPTED: 4, FINISHED: 5 } as const;
// RTC control-message interrupt priority (medium: wait for current turn to end).
export const INTERRUPT_MEDIUM = 2;
// @volcengine sendUserBinaryMessage caps each message at 1KB; keep payloads under this.
const RTC_MSG_MAX_BYTES = 980;

/** Parse a TLV binary message: | 4-byte magic | 4-byte big-endian length | value |. */
export function tlvDecode(buffer: ArrayBuffer): { type: string; value: string } {
    const typeBuffer = new Uint8Array(buffer, 0, 4);
    const lengthBuffer = new Uint8Array(buffer, 4, 4);
    const valueBuffer = new Uint8Array(buffer, 8);
    let type = '';
    for (let i = 0; i < typeBuffer.length; i++) type += String.fromCharCode(typeBuffer[i]);
    const length = (lengthBuffer[0] << 24) | (lengthBuffer[1] << 16) | (lengthBuffer[2] << 8) | lengthBuffer[3];
    const value = new TextDecoder().decode(valueBuffer.subarray(0, length));
    return { type, value };
}

/** Wrap a string into a TLV buffer with the given 4-char magic (e.g. 'func', 'ctrl'). */
export function tlvEncode(str: string, type: string): ArrayBuffer {
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

/** JSON-encode obj into a TLV, truncating obj[truncKey] by byte length until it fits. */
export function encodeFitting(obj: Record<string, unknown>, truncKey: string, magic: string): ArrayBuffer {
    const enc = new TextEncoder();
    let json = JSON.stringify(obj);
    if (enc.encode(json).length <= RTC_MSG_MAX_BYTES) return tlvEncode(json, magic);
    let val = String(obj[truncKey] ?? '');
    while (val.length > 0) {
        val = val.slice(0, Math.max(0, Math.floor(val.length * 0.85) - 1));
        json = JSON.stringify({ ...obj, [truncKey]: val ? `${val}…` : '' });
        if (enc.encode(json).length <= RTC_MSG_MAX_BYTES) break;
    }
    // Assumes obj[truncKey] is the dominant field; if other fields alone exceed
    // the limit the result may still be over RTC_MSG_MAX_BYTES (not an issue for
    // current callers: ToolCallID/Command are short).
    return tlvEncode(json, magic);
}

/** Make TTS-safe text from an agent reply: strip markup/code, collapse whitespace. */
export function cleanForSpeech(text: string): string {
    return text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/`[^`]*`/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[*#_>~|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Build a 'ctrl' control command buffer (interrupt / ExternalTextToSpeech / ExternalTextToLLM). */
export function buildAgentCommand(command: string, message: string): ArrayBuffer {
    return encodeFitting({ Command: command, InterruptMode: INTERRUPT_MEDIUM, Message: message }, 'Message', 'ctrl');
}

export type AgentEvent =
    | { kind: 'mode'; mode: 'thinking' | 'speaking' | 'idle' }
    | { kind: 'tool'; payload: unknown };

/** Decode an incoming RTC binary message into a semantic event, or null to ignore. */
export function parseAgentMessage(buffer: ArrayBuffer): AgentEvent | null {
    let decoded: { type: string; value: string };
    try {
        decoded = tlvDecode(buffer);
    } catch {
        return null;
    }
    const { type, value } = decoded;
    if (type === 'tool') {
        try {
            return { kind: 'tool', payload: JSON.parse(value) };
        } catch {
            return null;
        }
    }
    if (type === 'conv') {
        try {
            const code = JSON.parse(value)?.Stage?.Code;
            if (code === AGENT_BRIEF.THINKING) return { kind: 'mode', mode: 'thinking' };
            if (code === AGENT_BRIEF.SPEAKING) return { kind: 'mode', mode: 'speaking' };
            if (code === AGENT_BRIEF.LISTENING || code === AGENT_BRIEF.FINISHED || code === AGENT_BRIEF.INTERRUPTED) {
                return { kind: 'mode', mode: 'idle' };
            }
        } catch {
            return null;
        }
    }
    // 'subv' (subtitles) etc. are ignored for now.
    return null;
}
