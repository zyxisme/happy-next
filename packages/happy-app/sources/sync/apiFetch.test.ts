import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiFetch, computeRetryDelayMs, hedgedApiFetch } from './apiFetch';

const BASE = 'https://api.example.com';

function jsonResponse(status: number, body: unknown = {}): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('computeRetryDelayMs', () => {
    it('equal jitter 边界:Math.random=0 取下界 raw/2', () => {
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
        expect(computeRetryDelayMs(0)).toBe(250);  // raw=500 -> 250
        expect(computeRetryDelayMs(1)).toBe(500);  // raw=1000 -> 500
        expect(computeRetryDelayMs(2)).toBe(1000); // raw=2000 -> 1000
        spy.mockRestore();
    });

    it('Math.random≈1 取上界≈raw,且受 cap=5000 约束', () => {
        const spy = vi.spyOn(Math, 'random').mockReturnValue(0.999999);
        expect(computeRetryDelayMs(0)).toBeLessThanOrEqual(500);
        expect(computeRetryDelayMs(10)).toBeLessThanOrEqual(5000); // cap
        spy.mockRestore();
    });
});

describe('apiFetch', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        // 让退避不真正 sleep
        vi.spyOn(Math, 'random').mockReturnValue(0);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('首次成功直接返回,不重试', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));
        const res = await apiFetch(`${BASE}/v1/orchestrator/runs`);
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('网络错误重试,最终成功', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockRejectedValueOnce(new TypeError('Network request failed'))
            .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
        const res = await apiFetch(`${BASE}/v1/orchestrator/runs`, undefined, { backoffMs: () => 0 });
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('网络错误耗尽 maxRetries 后抛出', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
        await expect(
            apiFetch(`${BASE}/v1/orchestrator/runs`, undefined, { maxRetries: 2, backoffMs: () => 0 }),
        ).rejects.toThrow(/Network request failed/);
        expect(fetchMock).toHaveBeenCalledTimes(3); // 1 + 2 retries
    });

    it('5xx 重试(非黑名单)', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(503))
            .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
        const res = await apiFetch(`${BASE}/v1/orchestrator/runs`, undefined, { backoffMs: () => 0 });
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('4xx 不重试,直接返回该响应', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(404, { error: 'nope' }));
        const res = await apiFetch(`${BASE}/v1/orchestrator/runs`, undefined, { backoffMs: () => 0 });
        expect(res.status).toBe(404);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('黑名单端点即使 5xx 也不重试', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(503));
        const res = await apiFetch(`${BASE}/v1/badge/increment`, { method: 'POST' }, { backoffMs: () => 0 });
        expect(res.status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('黑名单端点网络错误也不重试,直接抛', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
        await expect(
            apiFetch(`${BASE}/v1/badge/increment`, { method: 'POST' }, { backoffMs: () => 0 }),
        ).rejects.toThrow(/Network request failed/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('单次尝试超时触发 abort,算可重试网络失败', async () => {
        // 第一次:永不 resolve,直到被 abort
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
            return new Promise((_resolve, reject) => {
                const signal = (init as RequestInit | undefined)?.signal;
                signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            });
        });
        // 用极短超时触发,backoff=0
        const p = apiFetch(`${BASE}/v1/orchestrator/runs`, undefined, { timeoutMs: 5, maxRetries: 1, backoffMs: () => 0 });
        await expect(p).rejects.toThrow(); // 两次都超时 -> 抛出
        expect(fetchMock).toHaveBeenCalledTimes(2); // 1 + 1 retry
    });

    it('调用方主动取消:不重试,直接抛 AbortError', async () => {
        const controller = new AbortController();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
            return new Promise((_resolve, reject) => {
                const signal = (init as RequestInit | undefined)?.signal;
                signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
            });
        });
        const p = apiFetch(`${BASE}/v1/orchestrator/runs`, { signal: controller.signal }, { backoffMs: () => 0 });
        controller.abort();
        await expect(p).rejects.toThrow(/Aborted/);
        expect(fetchMock).toHaveBeenCalledTimes(1); // 不重试
    });

    it('429 重试', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch')
            .mockResolvedValueOnce(jsonResponse(429))
            .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
        const res = await apiFetch(`${BASE}/v1/orchestrator/runs`, undefined, { backoffMs: () => 0 });
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

describe('hedgedApiFetch', () => {
    const SEND = `${BASE}/v3/sessions/s1/send`;

    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('首个尝试成功:单次 fetch 即返回', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));
        const res = await hedgedApiFetch(SEND, { method: 'POST' }, { scheduleMs: [0], totalTimeoutMs: 1000 });
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('首个挂起时按 schedule 触发第二个并取胜', async () => {
        vi.useFakeTimers();
        let calls = 0;
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => {
            calls++;
            if (calls === 1) {
                // 永不 resolve,直到被 abort
                return new Promise((_resolve, reject) => {
                    (init as RequestInit | undefined)?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
                });
            }
            return Promise.resolve(jsonResponse(200, { ok: true }));
        });
        const p = hedgedApiFetch(SEND, { method: 'POST' }, { scheduleMs: [0, 10], totalTimeoutMs: 1000 });
        await vi.advanceTimersByTimeAsync(10);
        const res = await p;
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('所有尝试网络失败 -> reject', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Network request failed'));
        await expect(
            hedgedApiFetch(SEND, { method: 'POST' }, { scheduleMs: [0], totalTimeoutMs: 1000 }),
        ).rejects.toThrow(/Send failed/);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('非幂等端点不对冲:退化为单次尝试', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { ok: true }));
        const res = await hedgedApiFetch(`${BASE}/v1/badge/increment`, { method: 'POST' }, { scheduleMs: [0, 10] });
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('调用方已取消:直接 reject AbortError', async () => {
        const controller = new AbortController();
        controller.abort();
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200));
        await expect(
            hedgedApiFetch(SEND, { method: 'POST' }, { signal: controller.signal, scheduleMs: [0] }),
        ).rejects.toThrow(/Aborted/);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
