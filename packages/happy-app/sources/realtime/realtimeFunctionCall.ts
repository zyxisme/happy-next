import { realtimeClientTools } from './realtimeClientTools';
import { encodeFitting } from './happyVoiceProtocol';

type ToolName = keyof typeof realtimeClientTools;

/**
 * Execute agent function calls and send each result back via the injected sender.
 *
 * Kept separate from happyVoiceProtocol so that module stays a pure,
 * SDK/asset-free unit (importable under Vitest's node env). This file statically
 * imports realtimeClientTools — a static import is required: a dynamic
 * `import()` here fails at module-evaluation time in the React Native runtime,
 * which silently broke voice function calls on native.
 */
export async function runFunctionCall(parsed: any, send: (buf: ArrayBuffer) => void): Promise<void> {
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
        send(encodeFitting({ ToolCallID: id, Content: content }, 'Content', 'func'));
    }
}
