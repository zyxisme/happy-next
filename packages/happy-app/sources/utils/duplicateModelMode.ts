import { AgentFlavor, MODEL_MODE_DEFAULT, isModelModeForAgent } from 'happy-wire';

/**
 * Decide which modelMode a duplicated session should use.
 *
 * Why this exists: Claude Code's 1M-context auto-upgrade (the `[1m]` model
 * variant) is only applied on a *fresh* launch and is never written into the
 * session transcript — the transcript stores the stripped base name. Duplicating
 * forks that transcript and relaunches headlessly with `--resume`, which does NOT
 * re-apply the upgrade. So a source session whose selector reads "CLI" (modelMode
 * = "default") but was effectively running `claude-opus-4-7[1m]` would silently
 * drop the new session to 200K.
 *
 * To preserve it, when the source modelMode is "default" but the CLI actually
 * reported a `[1m]` model, pin the duplicate to that explicit variant so the new
 * session is launched with `--model …[1m]` and genuinely runs at 1M. An explicit
 * source modelMode is always copied verbatim.
 *
 * `actualModel` is the CLI-reported model from the source session's
 * `metadata.model`.
 */
export function resolveDuplicatedModelMode(
    sourceModelMode: string | null | undefined,
    actualModel: string | null | undefined,
    agentType: AgentFlavor,
): string {
    const modelMode = sourceModelMode || MODEL_MODE_DEFAULT;
    if (modelMode !== MODEL_MODE_DEFAULT) return modelMode;
    if (actualModel && actualModel.includes('[1m]') && isModelModeForAgent(agentType, actualModel)) {
        return actualModel;
    }
    return modelMode;
}
