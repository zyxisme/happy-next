// Run with: npx tsx sources/runtime/tts.test.ts
// happy-voice has no test runner; this is a standalone tsx + node:assert script.
import assert from 'node:assert';

// env.ts validates required vars at import time; set dummies before dynamic import.
process.env.VOICE_PUBLIC_KEY = 'test-key';
process.env.LIVEKIT_URL = 'wss://test.local';
process.env.LIVEKIT_API_KEY = 'test-api-key';
process.env.LIVEKIT_API_SECRET = 'test-api-secret';
process.env.CARTESIA_API_KEY = 'test-cartesia-key';

const { buildCartesiaTtsRequest } = await import('./tts.js');

async function main() {
    // 1. Builds a correct /tts/bytes request from "cartesia/<model>:<voice>".
    const req = buildCartesiaTtsRequest('cartesia/sonic-3:voice-abc', '你好');
    assert.strictEqual(req.url, 'https://api.cartesia.ai/tts/bytes', 'url');
    assert.strictEqual(req.headers['X-API-Key'], 'test-cartesia-key', 'api key header');
    assert.strictEqual(req.headers['Cartesia-Version'], '2024-11-13', 'version header');
    const body = JSON.parse(req.body);
    assert.strictEqual(body.model_id, 'sonic-3', 'model_id');
    assert.deepStrictEqual(body.voice, { mode: 'id', id: 'voice-abc' }, 'voice');
    assert.strictEqual(body.transcript, '你好', 'transcript');
    assert.strictEqual(body.language, 'zh', 'language');
    assert.strictEqual(body.output_format.container, 'wav', 'wav container');
    assert.strictEqual(body.output_format.encoding, 'pcm_s16le', 'pcm encoding');
    assert.strictEqual(body.output_format.sample_rate, 44100, 'sample rate');

    // 2. Missing voice id -> throws.
    assert.throws(() => buildCartesiaTtsRequest('cartesia/sonic-3', 'x'), /missing a voice id/, 'missing voice throws');

    console.log('All tts tests passed');
}

await main();
