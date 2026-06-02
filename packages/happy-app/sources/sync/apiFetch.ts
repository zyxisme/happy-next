//
// 指向 happy-server 的请求统一入口:单次尝试超时 + 网络层失败的有限退避重试。
// 仅对网络错误 / 超时 / 5xx / 429 重试;已返回的 4xx 直接交回调用方(交业务处理)。
// 黑名单端点(retryPolicy)任何失败都不重试,只加超时。
// 调用方主动 abort(opts.signal)视为取消,不重试。
import { delay } from '@/utils/time';
import { isRetryableRequest } from './retryPolicy';

export interface ApiFetchOptions {
    timeoutMs?: number;          // 单次尝试超时,默认 15000
    maxRetries?: number;         // 最大重试次数,默认 3
    retry?: boolean;             // 显式开关;默认按 retryPolicy 判定
    signal?: AbortSignal;        // 调用方取消信号
    backoffMs?: (attempt: number) => number; // 退避计算(便于测试注入),默认 computeRetryDelayMs
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_MAX_RETRIES = 3;

/** 指数退避 + equal jitter:raw=min(5000, 500*2^attempt),返回 [raw/2, raw] 内的整数毫秒。 */
export function computeRetryDelayMs(attempt: number): number {
    const base = 500;
    const factor = 2;
    const cap = 5000;
    const raw = Math.min(cap, base * Math.pow(factor, attempt));
    return Math.round(raw / 2 + Math.random() * (raw / 2));
}

/** 一次带超时的 fetch 尝试。返回 { response } 或 { networkError }。区分超时/调用方取消。 */
async function attemptOnce(
    url: string,
    init: RequestInit | undefined,
    timeoutMs: number,
    externalSignal: AbortSignal | undefined,
): Promise<{ response?: Response; networkError?: unknown; canceledByCaller?: boolean }> {
    const controller = new AbortController();
    let timedOut = false;

    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
        if (externalSignal.aborted) {
            return { canceledByCaller: true, networkError: new DOMException('Aborted', 'AbortError') };
        }
        externalSignal.addEventListener('abort', onExternalAbort);
    }
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);

    // 剥掉调用方 init.signal,统一用内部 controller(已组合超时 + 外部取消)。
    const { signal: _callerSignal, ...restInit } = init ?? {};
    try {
        const response = await fetch(url, { ...restInit, signal: controller.signal });
        return { response };
    } catch (e) {
        if (externalSignal?.aborted && !timedOut) {
            return { canceledByCaller: true, networkError: e };
        }
        return { networkError: e };
    } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', onExternalAbort);
    }
}

/** 是否对已拿到的响应重试:5xx 或 429。 */
function shouldRetryResponse(response: Response): boolean {
    return response.status >= 500 || response.status === 429;
}

export async function apiFetch(
    url: string,
    init?: RequestInit,
    opts?: ApiFetchOptions,
): Promise<Response> {
    const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxRetries = opts?.maxRetries ?? DEFAULT_MAX_RETRIES;
    const backoffMs = opts?.backoffMs ?? computeRetryDelayMs;
    const method = init?.method ?? 'GET';
    const allowRetry = opts?.retry ?? isRetryableRequest(method, url);
    // 调用方取消信号:优先 opts.signal,回退到标准的 init.signal。
    const callerSignal = opts?.signal ?? init?.signal ?? undefined;

    let lastNetworkError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const { response, networkError, canceledByCaller } = await attemptOnce(url, init, timeoutMs, callerSignal);

        if (canceledByCaller) {
            throw networkError;
        }

        if (response) {
            if (allowRetry && shouldRetryResponse(response) && attempt < maxRetries) {
                await delay(backoffMs(attempt));
                continue;
            }
            return response;
        }

        // 网络层失败(无响应)
        lastNetworkError = networkError;
        if (allowRetry && attempt < maxRetries) {
            await delay(backoffMs(attempt));
            continue;
        }
        throw networkError;
    }

    // 不可达,兜底
    throw lastNetworkError ?? new Error('apiFetch: exhausted retries');
}
