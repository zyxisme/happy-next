import type { QueryOptions } from '@/claude/sdk';
import type { PermissionMode } from '@/api/types';

/** Modes Claude Code CLI accepts for --permission-mode. */
export type ClaudeSdkPermissionMode = NonNullable<QueryOptions['permissionMode']>;

/**
 * Map Happy's Claude permission mode to the Claude CLI mode.
 * The UI/validation layer must only send Claude-supported modes here.
 */
export function mapToClaudeMode(mode: PermissionMode): ClaudeSdkPermissionMode {
    if (
        mode === 'default' ||
        mode === 'acceptEdits' ||
        mode === 'auto' ||
        mode === 'bypassPermissions' ||
        mode === 'plan'
    ) {
        return mode;
    }
    throw new Error(`Unsupported Claude permission mode: ${mode}`);
}
