import { describe, it, expect } from 'vitest';
import { isRetryableRequest } from './retryPolicy';

const BASE = 'https://api.example.com';

describe('isRetryableRequest', () => {
    it('普通 GET 列表请求可重试', () => {
        expect(isRetryableRequest('GET', `${BASE}/v1/orchestrator/runs`)).toBe(true);
    });

    it('badge/increment 禁止重试(累加)', () => {
        expect(isRetryableRequest('POST', `${BASE}/v1/badge/increment`)).toBe(false);
    });

    it('badge/reset 可重试(设值)', () => {
        expect(isRetryableRequest('POST', `${BASE}/v1/badge/reset`)).toBe(true);
    });

    it('openclaw machines POST 可重试(已加 idempotencyKey 去重)', () => {
        expect(isRetryableRequest('POST', `${BASE}/v1/openclaw/machines`)).toBe(true);
    });

    it('openclaw machines PUT 可重试(seq 仅在真实变更时自增)', () => {
        expect(isRetryableRequest('PUT', `${BASE}/v1/openclaw/machines/abc123`)).toBe(true);
    });

    it('openclaw machines GET 可重试', () => {
        expect(isRetryableRequest('GET', `${BASE}/v1/openclaw/machines`)).toBe(true);
    });

    it('public-share/:token GET 禁止重试(useCount++)', () => {
        expect(isRetryableRequest('GET', `${BASE}/v1/public-share/tok_abc`)).toBe(false);
    });

    it('public-share/:token/messages GET 可重试(只读,$ 锚定不误伤)', () => {
        expect(isRetryableRequest('GET', `${BASE}/v1/public-share/tok_abc/messages`)).toBe(true);
    });

    it('pin 可重试(已改显式 set 幂等)', () => {
        expect(isRetryableRequest('POST', `${BASE}/v3/sessions/s1/pending-messages/p1/pin`)).toBe(true);
    });

    it('忽略 query string,仍按 path 判定', () => {
        expect(isRetryableRequest('GET', `${BASE}/v1/public-share/tok_abc?x=1`)).toBe(false);
    });

    it('method 大小写不敏感', () => {
        expect(isRetryableRequest('post', `${BASE}/v1/badge/increment`)).toBe(false);
    });
});
