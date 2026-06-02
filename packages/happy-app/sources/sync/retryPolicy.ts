//
// 零信任重试黑名单。
// 这些 happy-server 端点违反了 .claude/rules/happy-server.md 的
// 「All operations must be idempotent — clients may retry automatically」原则:
// 重复请求会产生重复副作用,因此禁止客户端自动重试。
// 长期方向是在服务端修复成幂等,而非永久保留在此黑名单。
// 证据见 docs/superpowers/specs/2026-06-01-client-fetch-retry-timeout-design.md §4。

type NonRetryableRule = { method: string; pattern: RegExp; reason: string };

const NON_RETRYABLE: NonRetryableRule[] = [
    { method: 'POST', pattern: /^\/v1\/sessions\/spawn$/, reason: 'RPC 启动新会话进程 (sessionRoutes.ts:417)' },
    { method: 'POST', pattern: /^\/v1\/orchestrator\/tasks\/[^/]+\/send-message$/, reason: '新建 resume execution,重复投递 (orchestratorRoutes.ts:1296)' },
    { method: 'POST', pattern: /^\/v1\/badge\/increment$/, reason: 'badgeCount 累加 (pushRoutes.ts:127)' },
    { method: 'GET', pattern: /^\/v1\/public-share\/[^/]+$/, reason: 'useCount++ 且写访问日志 (publicShareRoutes.ts:328)' },
    { method: 'POST', pattern: /^\/v1\/chat\/upload-image$/, reason: '随机文件名,重复上传 (chatImageUpload.ts:81)' },
    { method: 'POST', pattern: /^\/v1\/voice\/tool-call$/, reason: 'RPC 执行动作两次 (voiceRoutes.ts:60)' },
    { method: 'GET', pattern: /^\/v1\/connect\/github\/callback$/, reason: '消费一次性 OAuth code (connectRoutes.ts:120)' },
    { method: 'POST', pattern: /^\/v1\/connect\/github\/webhook$/, reason: 'handler 未审,零信任默判禁 (connectRoutes.ts:190)' },
];

/**
 * 判断某请求是否允许自动重试。
 * 默认允许;命中黑名单(method + path 正则)则禁止。
 * 仅按 URL 的 pathname 匹配,忽略 query string。
 */
export function isRetryableRequest(method: string, url: string): boolean {
    const m = (method || 'GET').toUpperCase();
    let path: string;
    try {
        path = new URL(url).pathname;
    } catch {
        // 相对 URL 兜底:截掉 query/hash
        path = url.split('?')[0].split('#')[0];
    }
    for (const rule of NON_RETRYABLE) {
        if (rule.method === m && rule.pattern.test(path)) {
            return false;
        }
    }
    return true;
}
