import { describe, expect, it } from 'vitest';
import { mapToClaudeMode } from './permissionMode';

const claudeModes = ['default', 'acceptEdits', 'plan', 'auto', 'bypassPermissions'] as const;

describe('mapToClaudeMode', () => {
  it('passes through Claude CLI native permission modes', () => {
    for (const mode of claudeModes) {
      expect(mapToClaudeMode(mode)).toBe(mode);
    }
  });

  it('rejects non-Claude permission modes', () => {
    expect(() => mapToClaudeMode('read-only' as any)).toThrow('Unsupported Claude permission mode');
    expect(() => mapToClaudeMode('on-failure' as any)).toThrow('Unsupported Claude permission mode');
    expect(() => mapToClaudeMode('full-auto' as any)).toThrow('Unsupported Claude permission mode');
    expect(() => mapToClaudeMode('auto_edit' as any)).toThrow('Unsupported Claude permission mode');
    expect(() => mapToClaudeMode('yolo' as any)).toThrow('Unsupported Claude permission mode');
  });
});
