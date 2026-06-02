//
// Route retry classification — the single, enforced source of truth for whether a
// client may auto-retry each HTTP endpoint on a network/timeout failure.
//
// WHY THIS EXISTS
// The client (happy-app) auto-retries idempotent requests on flaky networks. The
// project rule (.claude/rules/happy-server.md) is "All operations must be idempotent —
// clients may retry automatically". To prevent a NEW non-idempotent endpoint from
// silently inheriting auto-retry (and producing duplicate side effects), EVERY route
// must be classified here. routeClassification.test.ts parses the route files and fails
// if any route is missing from this map or any entry here no longer exists — so adding
// a route forces an explicit, reviewed retry decision.
//
// CLASSES
//   'safe'        — pure read, or write made idempotent by a unique constraint /
//                   optimistic-lock version / localId dedup / upsert / DELETE-by-id /
//                   explicit-set. A client may auto-retry unconditionally.
//   'conditional' — idempotent ONLY when the caller supplies the dedup parameter
//                   (idempotencyKey, or pin's explicit { pinned }). Safe to retry when
//                   the documented contract is used; unsafe if the param is omitted.
//   'unsafe'      — non-idempotent side effect (counter increment, RPC execution,
//                   one-time token, random-filename upload, append). Never auto-retry.
//
// Long-term direction: shrink 'unsafe'/'conditional' by making the server idempotent,
// not by growing this list.

export type RetryClass = 'safe' | 'conditional' | 'unsafe';

export interface RouteClassification {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    retry: RetryClass;
    note?: string;
}

export const ROUTE_CLASSIFICATIONS: RouteClassification[] = [
    // --- Sessions (v1/v2/v3) ---
    { method: 'GET', path: '/v1/sessions', retry: 'safe' },
    { method: 'POST', path: '/v1/sessions/diff', retry: 'safe', note: 'read-only diff' },
    { method: 'GET', path: '/v2/sessions/active', retry: 'safe' },
    { method: 'GET', path: '/v2/sessions', retry: 'safe' },
    { method: 'POST', path: '/v1/sessions', retry: 'safe', note: 'find-or-create by unique tag' },
    { method: 'POST', path: '/v1/sessions/spawn', retry: 'unsafe', note: 'RPC spawns a process, no dedup' },
    { method: 'GET', path: '/v1/sessions/:sessionId/capabilities', retry: 'safe' },
    { method: 'PUT', path: '/v1/sessions/:sessionId/capabilities', retry: 'safe', note: 'optimistic lock' },
    { method: 'GET', path: '/v1/sessions/:sessionId/messages', retry: 'safe', note: 'deprecated read' },
    { method: 'DELETE', path: '/v1/sessions/:sessionId', retry: 'safe', note: 'delete by id' },
    { method: 'GET', path: '/v3/sessions/:sessionId/messages', retry: 'safe' },
    { method: 'POST', path: '/v3/sessions/:sessionId/messages', retry: 'safe', note: 'localId dedup' },
    { method: 'GET', path: '/v3/sessions/:sessionId/pending-messages', retry: 'safe' },
    { method: 'POST', path: '/v3/sessions/:sessionId/send', retry: 'safe', note: 'localId dedup' },
    { method: 'POST', path: '/v3/sessions/:sessionId/pending-messages/:pendingId/pin', retry: 'conditional', note: 'idempotent with { pinned }; legacy toggle when body omitted' },
    { method: 'DELETE', path: '/v3/sessions/:sessionId/pending-messages/:pendingId', retry: 'safe', note: 'delete by id' },

    // --- Chat ---
    { method: 'POST', path: '/v1/chat/upload-image', retry: 'unsafe', note: 'random filename, no dedup' },

    // --- Orchestrator ---
    { method: 'GET', path: '/v1/orchestrator/context', retry: 'safe' },
    { method: 'POST', path: '/v1/orchestrator/submit', retry: 'conditional', note: 'idempotent with idempotencyKey' },
    { method: 'GET', path: '/v1/orchestrator/runs/:runId', retry: 'safe' },
    { method: 'GET', path: '/v1/orchestrator/runs/:runId/tasks/:taskId', retry: 'safe' },
    { method: 'POST', path: '/v1/orchestrator/tasks/:taskId/send-message', retry: 'conditional', note: 'idempotent with idempotencyKey' },
    { method: 'GET', path: '/v1/orchestrator/runs', retry: 'safe' },
    { method: 'GET', path: '/v1/orchestrator/runs/counts', retry: 'safe' },
    { method: 'GET', path: '/v1/orchestrator/runs/:runId/pend', retry: 'safe', note: 'long-poll read' },
    { method: 'POST', path: '/v1/orchestrator/runs/:runId/cancel', retry: 'safe', note: 'state-machine idempotent' },
    { method: 'POST', path: '/v1/orchestrator/executions/:id/start', retry: 'safe', note: 'dispatchToken + status guard' },
    { method: 'POST', path: '/v1/orchestrator/executions/:id/finish', retry: 'safe', note: 'dispatchToken + status guard' },
    { method: 'GET', path: '/v1/orchestrator/activity', retry: 'safe' },
    { method: 'GET', path: '/v1/orchestrator/activity/batch', retry: 'safe' },

    // --- Machines / OpenClaw ---
    { method: 'POST', path: '/v1/machines', retry: 'safe', note: 'client-provided id dedup' },
    { method: 'GET', path: '/v1/machines', retry: 'safe' },
    { method: 'GET', path: '/v1/machines/:id', retry: 'safe' },
    { method: 'GET', path: '/v1/openclaw/machines', retry: 'safe' },
    { method: 'POST', path: '/v1/openclaw/machines', retry: 'conditional', note: 'idempotent with idempotencyKey' },
    { method: 'GET', path: '/v1/openclaw/machines/:id', retry: 'safe' },
    { method: 'PUT', path: '/v1/openclaw/machines/:id', retry: 'safe', note: 'seq bumps only on real change; metadata OCC' },
    { method: 'DELETE', path: '/v1/openclaw/machines/:id', retry: 'safe', note: 'delete by id' },

    // --- Account / Usage ---
    { method: 'GET', path: '/v1/account/profile', retry: 'safe' },
    { method: 'GET', path: '/v1/account/settings', retry: 'safe' },
    { method: 'POST', path: '/v1/account/settings', retry: 'safe', note: 'optimistic lock' },
    { method: 'POST', path: '/v1/usage/query', retry: 'safe', note: 'read-only aggregate' },

    // --- Auth ---
    { method: 'POST', path: '/v1/auth', retry: 'safe', note: 'upsert by publicKey' },
    { method: 'POST', path: '/v1/auth/request', retry: 'safe', note: 'upsert by publicKey' },
    { method: 'GET', path: '/v1/auth/request/status', retry: 'safe' },
    { method: 'POST', path: '/v1/auth/response', retry: 'safe', note: 'write-once guard' },
    { method: 'POST', path: '/v1/auth/account/request', retry: 'safe', note: 'upsert by publicKey' },
    { method: 'POST', path: '/v1/auth/account/response', retry: 'safe', note: 'write-once guard' },

    // --- Connect ---
    { method: 'GET', path: '/v1/connect/github/params', retry: 'safe', note: 'read-only (mints state)' },
    { method: 'GET', path: '/v1/connect/github/callback', retry: 'unsafe', note: 'consumes one-time OAuth code' },
    { method: 'POST', path: '/v1/connect/github/webhook', retry: 'unsafe', note: 'verifyAndReceive executes handlers' },
    { method: 'DELETE', path: '/v1/connect/github', retry: 'safe' },
    { method: 'POST', path: '/v1/connect/dootask', retry: 'safe', note: 'upsert' },
    { method: 'GET', path: '/v1/connect/dootask', retry: 'safe' },
    { method: 'DELETE', path: '/v1/connect/dootask', retry: 'safe' },
    { method: 'POST', path: '/v1/connect/:vendor/register', retry: 'safe', note: 'upsert by accountId+vendor' },
    { method: 'GET', path: '/v1/connect/:vendor/token', retry: 'safe' },
    { method: 'DELETE', path: '/v1/connect/:vendor', retry: 'safe', note: 'deleteMany (idempotent)' },
    { method: 'GET', path: '/v1/connect/tokens', retry: 'safe' },

    // --- User / Friends ---
    { method: 'GET', path: '/v1/user/:id', retry: 'safe' },
    { method: 'GET', path: '/v1/user/search', retry: 'safe' },
    { method: 'PUT', path: '/v1/user/content-key', retry: 'safe', note: 'overwrite write' },
    { method: 'POST', path: '/v1/friends/add', retry: 'safe', note: 'state-machine converges' },
    { method: 'POST', path: '/v1/friends/remove', retry: 'safe', note: 'idempotent removal' },
    { method: 'GET', path: '/v1/friends', retry: 'safe' },

    // --- Access keys ---
    { method: 'GET', path: '/v1/access-keys/:sessionId/:machineId', retry: 'safe' },
    { method: 'POST', path: '/v1/access-keys/:sessionId/:machineId', retry: 'safe', note: 'unique key, returns 409 on dup' },
    { method: 'PUT', path: '/v1/access-keys/:sessionId/:machineId', retry: 'safe', note: 'optimistic lock' },

    // --- KV ---
    { method: 'GET', path: '/v1/kv/:key', retry: 'safe' },
    { method: 'GET', path: '/v1/kv', retry: 'safe' },
    { method: 'POST', path: '/v1/kv/bulk', retry: 'safe', note: 'read-only' },
    { method: 'POST', path: '/v1/kv', retry: 'safe', note: 'optimistic lock per mutation' },

    // --- Artifacts ---
    { method: 'GET', path: '/v1/artifacts', retry: 'safe' },
    { method: 'GET', path: '/v1/artifacts/:id', retry: 'safe' },
    { method: 'POST', path: '/v1/artifacts', retry: 'safe', note: 'client-provided id dedup' },
    { method: 'POST', path: '/v1/artifacts/:id', retry: 'safe', note: 'optimistic lock' },
    { method: 'DELETE', path: '/v1/artifacts/:id', retry: 'safe', note: 'delete by id' },

    // --- Feed ---
    { method: 'GET', path: '/v1/feed', retry: 'safe' },
    { method: 'PATCH', path: '/v1/feed/:id/read', retry: 'safe', note: 'sets fixed value' },
    { method: 'DELETE', path: '/v1/feed/:id', retry: 'safe', note: 'deleteMany by id' },

    // --- Push ---
    { method: 'POST', path: '/v1/push-tokens', retry: 'safe', note: 'upsert' },
    { method: 'DELETE', path: '/v1/push-tokens/:token', retry: 'safe', note: 'deleteMany by token' },
    { method: 'GET', path: '/v1/push-tokens', retry: 'safe' },
    { method: 'POST', path: '/v1/badge/increment', retry: 'unsafe', note: 'counter increment' },
    { method: 'POST', path: '/v1/badge/reset', retry: 'safe', note: 'sets fixed value' },

    // --- Share ---
    { method: 'GET', path: '/v1/sessions/:sessionId/shares', retry: 'safe' },
    { method: 'POST', path: '/v1/sessions/:sessionId/shares', retry: 'safe', note: 'upsert by unique pair' },
    { method: 'PATCH', path: '/v1/sessions/:sessionId/shares/:shareId', retry: 'safe', note: 'sets fixed value' },
    { method: 'DELETE', path: '/v1/sessions/:sessionId/shares/:shareId', retry: 'safe', note: 'delete by id' },
    { method: 'GET', path: '/v1/sessions/shared-by-me', retry: 'safe' },
    { method: 'GET', path: '/v1/sessions/shared', retry: 'safe' },

    // --- Public share ---
    { method: 'POST', path: '/v1/sessions/:sessionId/public-share', retry: 'safe', note: 'create/update by sessionId' },
    { method: 'GET', path: '/v1/sessions/:sessionId/public-share', retry: 'safe' },
    { method: 'DELETE', path: '/v1/sessions/:sessionId/public-share', retry: 'safe' },
    { method: 'GET', path: '/v1/public-share/:token', retry: 'unsafe', note: 'useCount++ and access log' },
    { method: 'GET', path: '/v1/public-share/:token/messages', retry: 'safe', note: 'read-only' },
    { method: 'GET', path: '/v1/sessions/:sessionId/public-share/blocked-users', retry: 'safe' },
    { method: 'POST', path: '/v1/sessions/:sessionId/public-share/blocked-users', retry: 'safe', note: 'upsert by unique pair' },
    { method: 'DELETE', path: '/v1/sessions/:sessionId/public-share/blocked-users/:blockedUserId', retry: 'safe', note: 'deleteMany (idempotent)' },
    { method: 'GET', path: '/v1/sessions/:sessionId/public-share/access-logs', retry: 'safe' },

    // --- Voice / Version / Dev ---
    { method: 'POST', path: '/v1/voice/tool-call', retry: 'unsafe', note: 'RPC executes an action' },
    { method: 'POST', path: '/v1/version', retry: 'safe', note: 'read-only compute' },
    { method: 'POST', path: '/logs-combined-from-cli-and-mobile-for-simple-ai-debugging', retry: 'unsafe', note: 'append log; dev-only route' },
];
