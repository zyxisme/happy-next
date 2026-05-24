import { describe, expect, it } from 'vitest';
import { canAutoApproveForMode } from './permissionHandler';

// canAutoApproveForMode decides whether a tool that already reached our
// permission callback may be auto-approved purely from the permission mode.
// The key invariant under test: bypassPermissions must NOT short-circuit to
// allow here. The Claude CLI auto-approves everything it can on its own and
// only delegates to this callback the tools it won't decide (verified: it
// auto-runs Write under bypassPermissions but routes AskUserQuestion and
// ExitPlanMode through the callback). So anything reaching us under
// bypassPermissions is a user-interaction the user must resolve.
describe('canAutoApproveForMode', () => {
    it('never auto-approves under bypassPermissions, whatever the tool is', () => {
        // Interaction tools the CLI delegates under bypass.
        expect(canAutoApproveForMode('bypassPermissions', { edit: false })).toBe(false);
        // Even an edit tool: under bypass it would only reach us if the CLI
        // delegated it, so we still ask rather than silently allow.
        expect(canAutoApproveForMode('bypassPermissions', { edit: true })).toBe(false);
    });

    it('auto-approves edit tools under acceptEdits only', () => {
        expect(canAutoApproveForMode('acceptEdits', { edit: true })).toBe(true);
        expect(canAutoApproveForMode('acceptEdits', { edit: false })).toBe(false);
    });

    it('never auto-approves under default/plan/auto', () => {
        for (const mode of ['default', 'plan', 'auto'] as const) {
            expect(canAutoApproveForMode(mode, { edit: true })).toBe(false);
            expect(canAutoApproveForMode(mode, { edit: false })).toBe(false);
        }
    });
});
