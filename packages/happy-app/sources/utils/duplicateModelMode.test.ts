import { describe, it, expect } from 'vitest';
import { resolveDuplicatedModelMode } from './duplicateModelMode';

describe('resolveDuplicatedModelMode', () => {
    it('pins a CLI-default Claude session to the actual [1m] model the CLI reported', () => {
        // The original ran on "default" (selector shows CLI) but Claude Code
        // auto-upgraded Opus to 1M, so metadata.model is the [1m] variant.
        // A headless --resume would otherwise drop back to 200K.
        expect(
            resolveDuplicatedModelMode('default', 'claude-opus-4-7[1m]', 'claude'),
        ).toBe('claude-opus-4-7[1m]');
        expect(
            resolveDuplicatedModelMode(undefined, 'claude-sonnet-4-6[1m]', 'claude'),
        ).toBe('claude-sonnet-4-6[1m]');
    });

    it('keeps "default" when the reported model has no [1m] suffix', () => {
        expect(
            resolveDuplicatedModelMode('default', 'claude-opus-4-7', 'claude'),
        ).toBe('default');
    });

    it('keeps "default" when there is no reported model', () => {
        expect(resolveDuplicatedModelMode('default', null, 'claude')).toBe('default');
        expect(resolveDuplicatedModelMode('default', undefined, 'claude')).toBe('default');
    });

    it('does not override an explicit modelMode selection', () => {
        // User explicitly picked a mode — copy it verbatim, even if meta has [1m].
        expect(
            resolveDuplicatedModelMode('claude-opus-4-7-high', 'claude-opus-4-7[1m]', 'claude'),
        ).toBe('claude-opus-4-7-high');
    });

    it('keeps "default" when the [1m] model is not valid for the agent', () => {
        // A Claude [1m] model reported under a gemini agent must not be pinned.
        expect(
            resolveDuplicatedModelMode('default', 'claude-opus-4-7[1m]', 'gemini'),
        ).toBe('default');
    });
});
