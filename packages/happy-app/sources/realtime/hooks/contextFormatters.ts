import { Session } from "@/sync/storageTypes";
import { Message } from "@/sync/typesMessage";
import { trimIdent } from "@/utils/trimIdent";
import { VOICE_CONFIG } from "../voiceConfig";

interface SessionMetadata {
    summary?: { text?: string };
    path?: string;
    machineId?: string;
    homeDir?: string;
    [key: string]: any;
}

export interface ContextMessage {
    role: 'agent' | 'user' | 'tool';
    text: string;
    name?: string;
}


/**
 * Format a permission request for natural language context
 */
export function formatPermissionRequest(
    sessionId: string,
    requestId: string,
    toolName: string,
    toolArgs: any
): string {
    return trimIdent(`
        Agent is requesting permission to use ${toolName} (session ${sessionId}):
        <request_id>${requestId}</request_id>
        <tool_name>${toolName}</tool_name>
        <tool_args>${JSON.stringify(toolArgs)}</tool_args>
    `);
}

//
// Message formatting
//

function formatMessageObj(message: Message): ContextMessage | null {
    if (message.kind === 'agent-text') {
        return { role: 'agent', text: message.text };
    }
    if (message.kind === 'user-text') {
        return { role: 'user', text: message.text };
    }
    if (message.kind === 'tool-call' && !VOICE_CONFIG.DISABLE_TOOL_CALLS) {
        const toolDescription = message.tool.description ? ` - ${message.tool.description}` : '';
        if (VOICE_CONFIG.LIMITED_TOOL_CALLS) {
            if (message.tool.description) {
                return { role: 'tool', name: message.tool.name, text: toolDescription.trim() };
            }
        } else {
            return { role: 'tool', name: message.tool.name, text: `${toolDescription} arguments: ${JSON.stringify(message.tool.input)}` };
        }
    }
    return null;
}

export function formatNewMessages(sessionId: string, messages: Message[]): string | null {
    const objs = [...messages]
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(formatMessageObj)
        .filter((m): m is ContextMessage => m !== null);
    if (objs.length === 0) return null;
    return JSON.stringify({ type: 'messages', messages: objs });
}

function formatHistoryAsArray(messages: Message[]): ContextMessage[] {
    let messagesToFormat: Message[];
    messagesToFormat = VOICE_CONFIG.MAX_HISTORY_MESSAGES > 0
        ? messages.slice(0, VOICE_CONFIG.MAX_HISTORY_MESSAGES)
        : messages;

    // Stored message order is newest->oldest; Happy Voice providers use oldest->newest.
    messagesToFormat = [...messagesToFormat].reverse();

    return messagesToFormat.map(formatMessageObj).filter((m): m is ContextMessage => m !== null);
}

//
// Session states
//

export function formatSessionFull(session: Session, messages: Message[]): string {
    const sessionName = session.metadata?.summary?.text;
    const sessionPath = session.metadata?.path;

    return JSON.stringify({
        type: 'session',
        sessionId: session.id,
        path: sessionPath || '',
        summary: sessionName || '',
        messages: formatHistoryAsArray(messages),
    });
}

export function formatSessionOffline(sessionId: string, metadata?: SessionMetadata): string {
    return `Session went offline: ${sessionId}`;
}

export function formatSessionOnline(sessionId: string, metadata?: SessionMetadata): string {
    return `Session came online: ${sessionId}`;
}

export function formatReadyEvent(sessionId: string): string {
    return `Agent done working in session: ${sessionId}. The previous message(s) are the summary of the work done. Report this to the human immediately.`;
}
