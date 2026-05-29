import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { forkAndTruncateSession } from './claudeSessionFork';

// Helpers to build a minimal Claude session JSONL.
function msg(uuid: string, parentUuid: string | null, role: 'user' | 'assistant', text: string, ts: string) {
    return JSON.stringify({
        type: role,
        uuid,
        parentUuid,
        timestamp: ts,
        isSidechain: false,
        message: { role, content: [{ type: 'text', text }] },
    });
}
function lastPrompt(leafUuid: string, sessionId: string, prompt = 'hello') {
    return JSON.stringify({ type: 'last-prompt', lastPrompt: prompt, leafUuid, sessionId });
}

function readLastPromptLeaf(path: string): string | null {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        const e = JSON.parse(line);
        if (e.type === 'last-prompt') return e.leafUuid;
    }
    return null;
}

describe('forkAndTruncateSession last-prompt repointing', () => {
    let tempRoot: string;
    let claudeConfigDir: string;
    let projectsDir: string;
    let oldClaudeConfigDir: string | undefined;
    const projectId = '-test-project';

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'claude-fork-'));
        claudeConfigDir = join(tempRoot, 'claude');
        projectsDir = join(claudeConfigDir, 'projects', projectId);
        mkdirSync(projectsDir, { recursive: true });
        oldClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
        process.env.CLAUDE_CONFIG_DIR = claudeConfigDir;
    });

    afterEach(() => {
        if (oldClaudeConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
        else process.env.CLAUDE_CONFIG_DIR = oldClaudeConfigDir;
        rmSync(tempRoot, { recursive: true, force: true });
    });

    function writeSession(sessionId: string, lines: string[]) {
        writeFileSync(join(projectsDir, `${sessionId}.jsonl`), lines.join('\n') + '\n');
    }

    // Reproduces the real bug: a mid-session error split the tree into two sibling
    // branches; last-prompt points at the EARLY branch while the actual latest
    // progress lives on the other branch. A whole-session fork must resume from the
    // real latest message, not the stale bookmark.
    it('repoints a stale last-prompt to the latest leaf on a branched tree', async () => {
        const sid = 'branched';
        writeSession(sid, [
            msg('u-first', null, 'user', 'let us play', '2026-05-29T06:27:46Z'),
            msg('a-ready', 'u-first', 'assistant', 'ready!', '2026-05-29T06:28:04Z'), // branch A leaf
            msg('u-one', 'u-first', 'user', 'one', '2026-05-29T06:28:08Z'),           // branch B (sibling)
            msg('a-six', 'u-one', 'assistant', 'six', '2026-05-29T06:28:30Z'),        // branch B leaf (latest)
            lastPrompt('a-ready', sid), // stale: points at the early branch
        ]);

        const result = await forkAndTruncateSession(projectId, sid);

        expect(result.success).toBe(true);
        const newPath = join(projectsDir, `${result.newSessionId}.jsonl`);
        expect(readLastPromptLeaf(newPath)).toBe('a-six');
    });

    // After truncation the bookmark may point at a removed node. It must be
    // repointed to the latest retained leaf.
    it('repoints a dangling last-prompt after truncation', async () => {
        const sid = 'linear';
        writeSession(sid, [
            msg('a', null, 'user', 'A', '2026-05-29T06:00:00Z'),
            msg('b', 'a', 'assistant', 'B', '2026-05-29T06:00:01Z'),
            msg('c', 'b', 'user', 'C', '2026-05-29T06:00:02Z'),
            msg('d', 'c', 'assistant', 'D', '2026-05-29T06:00:03Z'),
            lastPrompt('d', sid), // points at D, which truncation removes
        ]);

        // Fork from message C → truncate before C, keeping A, B.
        const result = await forkAndTruncateSession(projectId, sid, 'c');

        expect(result.success).toBe(true);
        const newPath = join(projectsDir, `${result.newSessionId}.jsonl`);
        expect(readLastPromptLeaf(newPath)).toBe('b');
    });

    // Control: a clean linear session keeps a correct bookmark.
    it('leaves a correct last-prompt untouched on a clean linear session', async () => {
        const sid = 'clean';
        writeSession(sid, [
            msg('a', null, 'user', 'A', '2026-05-29T06:00:00Z'),
            msg('b', 'a', 'assistant', 'B', '2026-05-29T06:00:01Z'),
            lastPrompt('b', sid),
        ]);

        const result = await forkAndTruncateSession(projectId, sid);

        expect(result.success).toBe(true);
        const newPath = join(projectsDir, `${result.newSessionId}.jsonl`);
        expect(readLastPromptLeaf(newPath)).toBe('b');
    });
});
