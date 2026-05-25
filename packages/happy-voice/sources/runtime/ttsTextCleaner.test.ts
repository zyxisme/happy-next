// Run with: npx tsx sources/runtime/ttsTextCleaner.test.ts
// happy-voice has no test runner; this is a standalone tsx + node:assert script.
import assert from 'node:assert';

// env.ts validates required vars at import time, so set dummies BEFORE importing
// the module under test (which transitively imports env.ts). Dynamic import keeps
// these assignments before module evaluation.
process.env.VOICE_PUBLIC_KEY = 'test-key';
process.env.LIVEKIT_URL = 'wss://test.local';
process.env.LIVEKIT_API_KEY = 'test-api-key';
process.env.LIVEKIT_API_SECRET = 'test-api-secret';

const { runClean } = await import('./ttsTextCleaner.js');
import type { CleanLlm } from './ttsTextCleaner.js';

// Build a fake LLM whose chat() yields the given content chunks, or throws.
// `captured` (if provided) records the extraKwargs the last chat() call received.
function fakeLlm(result: string[] | Error, captured?: { extraKwargs?: Record<string, unknown> }): CleanLlm {
    return {
        chat(opts) {
            if (captured) {
                captured.extraKwargs = opts.extraKwargs as Record<string, unknown> | undefined;
            }
            if (result instanceof Error) {
                return (async function* () {
                    throw result;
                    // eslint-disable-next-line no-unreachable
                    yield { delta: { content: '' } };
                })();
            }
            return (async function* () {
                for (const c of result) {
                    yield { delta: { content: c } };
                }
            })();
        },
    };
}

async function main() {
    // 1. Normal rewrite: concatenated chunk content, trimmed.
    const ok = await runClean(fakeLlm(['你好，', '这是清洗后的文本。']), '原始 **文本**', 5000);
    assert.strictEqual(ok, '你好，这是清洗后的文本。', 'should return concatenated cleaned text');

    // 2. LLM throws -> fall back to original.
    const errFallback = await runClean(fakeLlm(new Error('boom')), 'raw text', 5000);
    assert.strictEqual(errFallback, 'raw text', 'should fall back to original on error');

    // 3. Empty/whitespace output -> fall back to original.
    const emptyFallback = await runClean(fakeLlm(['   ']), 'raw text 2', 5000);
    assert.strictEqual(emptyFallback, 'raw text 2', 'should fall back to original on empty output');

    // 4. reasoning_effort is forwarded only when provided.
    const capWith: { extraKwargs?: Record<string, unknown> } = {};
    await runClean(fakeLlm(['x'], capWith), 't', 5000, 'low');
    assert.strictEqual(capWith.extraKwargs?.reasoning_effort, 'low', 'should forward reasoning_effort when set');

    const capWithout: { extraKwargs?: Record<string, unknown> } = {};
    await runClean(fakeLlm(['x'], capWithout), 't', 5000);
    assert.strictEqual('reasoning_effort' in (capWithout.extraKwargs ?? {}), false, 'should omit reasoning_effort when not set');

    console.log('All ttsTextCleaner tests passed');
}

await main();
