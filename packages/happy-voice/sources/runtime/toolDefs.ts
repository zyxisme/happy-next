/**
 * The 11 voice tools, in OpenAI/Ark `tools` format. Names + descriptions +
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
            description: 'List all coding sessions.',
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
            description: 'Switch to a different coding session by its ID.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string', description: 'Target session ID' },
                },
                required: ['sessionId'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'createSession',
            description: 'Create a new coding session.',
            parameters: {
                type: 'object',
                properties: {
                    directory: { type: 'string', description: 'Working directory for the new session' },
                },
                required: [],
                additionalProperties: false,
            },
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
                    value: { type: 'string' },
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
            description: 'Delete an existing coding session after confirmation.',
            parameters: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string' },
                    confirmed: { type: 'boolean' },
                },
                required: ['sessionId', 'confirmed'],
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
];

const VALID_TOOL_NAMES = new Set(TOOL_DEFINITIONS.map((t) => t.function.name));

export function isKnownTool(name: string): boolean {
    return VALID_TOOL_NAMES.has(name);
}
