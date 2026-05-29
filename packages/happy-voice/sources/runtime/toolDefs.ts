/**
 * The 12 voice tools, in OpenAI/Ark `tools` format. Names + descriptions +
 * parameter schemas are identical to the original happy-voice agent so the
 * happy-server tool bridge (voice-tool:<name>) keeps working unchanged.
 */

export interface OpenAiTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

const emptyParams = {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
    additionalProperties: false,
};

export const TOOL_DEFINITIONS: OpenAiTool[] = [
    {
        type: 'function',
        function: {
            name: 'messageHappyCode',
            description:
                'Forward a message to the coding agent. Use when the user explicitly asks to send something to Happy, or for code/project tasks. For app operations (sessions, settings, navigation) use the dedicated tools instead.',
            parameters: {
                type: 'object',
                properties: {
                    message: { type: 'string', description: 'Message to forward to Happy' },
                },
                required: ['message'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'processPermissionRequest',
            description: 'Allow or deny a pending permission request.',
            parameters: {
                type: 'object',
                properties: {
                    decision: { type: 'string', enum: ['allow', 'deny'] },
                },
                required: ['decision'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'listSessions',
            description: 'List all coding sessions. Opens a picker modal listing every session by number for the user to tap or to refer to by index ("the second one") / name. Returns the full ordered list as text so you can speak the top 3 and pick the right id for the follow-up switchSession call.',
            parameters: {
                type: 'object',
                properties: {
                    includeOffline: {
                        type: 'boolean',
                        description: 'Include offline sessions. Defaults to false.',
                    },
                },
                required: [],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'switchSession',
            description: 'Switch to a different coding session. Call with no sessionId to open a picker modal that lists all sessions for the user to choose from (by voice "the Nth one" / by name, or by tapping). Call with sessionId (from a prior listSessions or after the user picked verbally) to switch directly and close any open picker.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Optional. Target session ID from listSessions, or session name. Omit to open the picker.' },
                },
                required: [],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'createSession',
            description: 'Create a new coding session. Directory and machine are derived automatically: from the current voice-chat session if one is active, otherwise from the user\'s most recent path in the /new wizard history. Takes no parameters.',
            parameters: emptyParams,
        },
    },
    {
        type: 'function',
        function: {
            name: 'changeSessionSettings',
            description: 'Change session settings such as model or permission mode.',
            parameters: {
                type: 'object',
                properties: {
                    setting: { type: 'string', enum: ['permissionMode', 'modelMode'] },
                    value: {
                        type: 'string',
                        description: 'For permissionMode: one of default, plan, acceptEdits, bypassPermissions, yolo, read-only, auto, on-failure, full-auto, auto_edit. For modelMode: "default", or a specific model like claude-opus-4-8, claude-opus-4-8[1m], claude-sonnet-4-6, claude-haiku-4-5, gpt-5.5-medium, gemini-3.5-pro-preview. Reasoning variants append -low/-medium/-high/-xhigh/-max (e.g. claude-opus-4-8-high). On invalid value the tool returns the full list.',
                    },
                },
                required: ['setting', 'value'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'getSessionStatus',
            description: 'Get current status from the active coding session.',
            parameters: emptyParams,
        },
    },
    {
        type: 'function',
        function: {
            name: 'getLatestAssistantReply',
            description:
                'Use when the user asks what Happy just replied. Returns the latest assistant text from the active coding session.',
            parameters: {
                type: 'object',
                properties: {
                    maxChars: {
                        type: 'integer',
                        minimum: 1,
                        maximum: 2000,
                        description: 'Max characters to return',
                    },
                },
                required: [],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'deleteSessionTool',
            description: 'Delete (archive) a coding session. Call with no sessionId to open a picker modal that lists all sessions for the user to choose from. Tapping a row archives immediately; saying "the Nth one" prompts you to call deleteSessionTool(sessionId=…) which triggers a countdown confirmation modal — countdown reaching zero archives the session.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Optional. Target session ID from listSessions or session name. Omit to open the picker.' },
                },
                required: [],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'navigateHome',
            description: 'Navigate to the home screen and leave the current conversation.',
            parameters: emptyParams,
        },
    },
    {
        type: 'function',
        function: {
            name: 'endVoiceConversation',
            description: 'End the current voice conversation.',
            parameters: emptyParams,
        },
    },
    {
        type: 'function',
        function: {
            name: 'cancelPendingAction',
            description: 'Cancel the currently open voice confirmation modal (countdown or session picker). Use when the user says "算了" / "cancel" / "stop" while a modal is up.',
            parameters: emptyParams,
        },
    },
];

const VALID_TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((t) => t.function.name));

export function isKnownTool(name: string): boolean {
    return VALID_TOOL_NAMES.has(name);
}
