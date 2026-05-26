import { describe, it, expect } from 'vitest';
import {
    tlvEncode, tlvDecode, encodeFitting, cleanForSpeech,
    buildAgentCommand, parseAgentMessage, AGENT_BRIEF,
} from './happyVoiceProtocol';

describe('TLV', () => {
    it('round-trips type + value', () => {
        const buf = tlvEncode('hello 世界', 'ctrl');
        const { type, value } = tlvDecode(buf);
        expect(type).toBe('ctrl');
        expect(value).toBe('hello 世界');
    });
});

describe('encodeFitting', () => {
    it('keeps payload under 980 bytes by truncating the given key', () => {
        const big = 'x'.repeat(5000);
        const buf = encodeFitting({ Content: big, ToolCallID: 'id1' }, 'Content', 'func');
        expect(buf.byteLength).toBeLessThanOrEqual(980 + 8); // +8 TLV header
        const { type, value } = tlvDecode(buf);
        expect(type).toBe('func');
        const obj = JSON.parse(value);
        expect(obj.ToolCallID).toBe('id1');
        expect(obj.Content.length).toBeLessThan(big.length);
    });

    it('leaves small payloads intact', () => {
        const buf = encodeFitting({ Content: 'hi', ToolCallID: 'id1' }, 'Content', 'func');
        const obj = JSON.parse(tlvDecode(buf).value);
        expect(obj.Content).toBe('hi');
    });
});

describe('cleanForSpeech', () => {
    it('strips code fences, inline code, html and md markers', () => {
        expect(cleanForSpeech('see `x` and ```js\ncode\n``` <b>hi</b> **bold**')).toBe('see and hi bold');
    });
});

describe('buildAgentCommand', () => {
    it('builds a ctrl TLV with Command/InterruptMode/Message', () => {
        const buf = buildAgentCommand('ExternalTextToSpeech', 'hello');
        const obj = JSON.parse(tlvDecode(buf).value);
        expect(tlvDecode(buf).type).toBe('ctrl');
        expect(obj.Command).toBe('ExternalTextToSpeech');
        expect(obj.Message).toBe('hello');
        expect(obj.InterruptMode).toBe(2);
    });
});

describe('parseAgentMessage', () => {
    const conv = (code: number) => tlvEncode(JSON.stringify({ Stage: { Code: code } }), 'conv');

    it('maps conv stage codes to mode events', () => {
        expect(parseAgentMessage(conv(AGENT_BRIEF.THINKING))).toEqual({ kind: 'mode', mode: 'thinking' });
        expect(parseAgentMessage(conv(AGENT_BRIEF.SPEAKING))).toEqual({ kind: 'mode', mode: 'speaking' });
        expect(parseAgentMessage(conv(AGENT_BRIEF.LISTENING))).toEqual({ kind: 'mode', mode: 'idle' });
        expect(parseAgentMessage(conv(AGENT_BRIEF.FINISHED))).toEqual({ kind: 'mode', mode: 'idle' });
        expect(parseAgentMessage(conv(AGENT_BRIEF.INTERRUPTED))).toEqual({ kind: 'mode', mode: 'idle' });
    });

    it('returns a tool event for the tool channel', () => {
        const buf = tlvEncode(JSON.stringify({ tool_calls: [{ id: '1' }] }), 'tool');
        expect(parseAgentMessage(buf)).toEqual({ kind: 'tool', payload: { tool_calls: [{ id: '1' }] } });
    });

    it('returns null for unknown / unparseable messages', () => {
        expect(parseAgentMessage(tlvEncode('not json', 'conv'))).toBeNull();
        expect(parseAgentMessage(tlvEncode('x', 'subv'))).toBeNull();
    });
});
