import fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Fastify } from "../types";

type SessionRow = {
    id: string;
    accountId: string;
    seq: number;
    metadata: string;
    metadataVersion: number;
    agentState: string | null;
    agentStateVersion: number;
    dataEncryptionKey: Uint8Array | null;
    active: boolean;
    lastActiveAt: Date;
    createdAt: Date;
    updatedAt: Date;
    shareCount: number;
    publicShareId: string | null;
};

type SessionDeletionRow = {
    accountId: string;
    sessionId: string;
    deletedAt: Date;
};

const { state, dbMock, resetState, seedSession } = vi.hoisted(() => {
    const state = {
        sessions: [] as SessionRow[],
        deletions: [] as SessionDeletionRow[]
    };

    const resetState = () => {
        state.sessions = [];
        state.deletions = [];
    };

    const seedSession = (row: SessionRow) => {
        state.sessions.push(row);
    };

    const findMany = vi.fn(async (args: any) => {
        const accountId = args?.where?.accountId as string;
        const sinceGt = args?.where?.updatedAt?.gt as Date | undefined;
        const olderOr = args?.where?.OR as any[] | undefined;
        const idIn = args?.where?.id?.in as string[] | undefined;
        let rows = state.sessions.filter((s) => s.accountId === accountId);
        if (idIn) {
            const idSet = new Set(idIn);
            rows = rows.filter((s) => idSet.has(s.id));
        }
        if (sinceGt) {
            rows = rows.filter((s) => s.updatedAt.getTime() > sinceGt.getTime());
        }
        if (olderOr) {
            rows = rows.filter((s) => olderOr.some((clause) => {
                const lt = clause?.updatedAt?.lt as Date | undefined;
                if (lt && s.updatedAt.getTime() < lt.getTime()) return true;
                const eq = clause?.updatedAt as Date | undefined;
                const idLt = clause?.id?.lt as string | undefined;
                return !!(eq && idLt && s.updatedAt.getTime() === eq.getTime() && s.id < idLt);
            }));
        }
        const orderByUpdatedAtAsc = args?.orderBy?.updatedAt === 'asc';
        const orderByUpdatedAtDesc = Array.isArray(args?.orderBy) && args.orderBy[0]?.updatedAt === 'desc';
        if (orderByUpdatedAtAsc) {
            rows.sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime());
        } else if (orderByUpdatedAtDesc) {
            rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || b.id.localeCompare(a.id));
        } else {
            rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        }
        const take = args?.take ?? rows.length;
        rows = rows.slice(0, take);
        return rows.map((s) => ({
            id: s.id,
            seq: s.seq,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt,
            metadata: s.metadata,
            metadataVersion: s.metadataVersion,
            agentState: s.agentState,
            agentStateVersion: s.agentStateVersion,
            dataEncryptionKey: s.dataEncryptionKey,
            active: s.active,
            lastActiveAt: s.lastActiveAt,
            _count: { shares: s.shareCount },
            publicShare: s.publicShareId ? { id: s.publicShareId } : null
        }));
    });

    const findManyDeletions = vi.fn(async (args: any) => {
        const accountId = args?.where?.accountId as string;
        const sinceGt = args?.where?.deletedAt?.gt as Date | undefined;
        let rows = state.deletions.filter((d) => d.accountId === accountId);
        if (sinceGt) {
            rows = rows.filter((d) => d.deletedAt.getTime() > sinceGt.getTime());
        }
        rows.sort((a, b) => a.deletedAt.getTime() - b.deletedAt.getTime());
        const take = args?.take ?? rows.length;
        return rows.slice(0, take);
    });

    const dbMock = {
        session: { findMany },
        sessionDeletion: { findMany: findManyDeletions }
    };

    return { state, dbMock, resetState, seedSession };
});

vi.mock("@/storage/db", () => ({ db: dbMock }));
vi.mock("@/app/events/eventRouter", () => ({
    eventRouter: { emitUpdate: vi.fn() },
    buildNewSessionUpdate: vi.fn()
}));
vi.mock("@/storage/seq", () => ({ allocateUserSeq: vi.fn(async () => 1) }));
vi.mock("@/utils/randomKeyNaked", () => ({ randomKeyNaked: () => "rand" }));
vi.mock("@/utils/log", () => ({ log: () => {} }));
vi.mock("@/app/session/sessionDelete", () => ({ sessionDelete: vi.fn() }));
vi.mock("@/app/api/socket/rpcRegistry", () => ({ invokeUserRpc: vi.fn() }));

import { sessionRoutes } from "./sessionRoutes";

describe("GET /v1/sessions", () => {
    let app: ReturnType<typeof fastify>;

    beforeEach(async () => {
        resetState();
        app = fastify();
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        app.decorate("authenticate", async (request: any) => {
            request.userId = "user-1";
        });
        sessionRoutes(app as unknown as Fastify);
        await app.ready();
    });

    afterEach(async () => {
        await app.close();
    });

    const mkSession = (overrides: Partial<SessionRow>): SessionRow => ({
        id: "s1",
        accountId: "user-1",
        seq: 0,
        metadata: "m",
        metadataVersion: 0,
        agentState: null,
        agentStateVersion: 0,
        dataEncryptionKey: null,
        active: true,
        lastActiveAt: new Date(0),
        createdAt: new Date(0),
        updatedAt: new Date(0),
        shareCount: 0,
        publicShareId: null,
        ...overrides
    });

    it("returns all sessions without since (desc by createdAt)", async () => {
        seedSession(mkSession({ id: "a", createdAt: new Date(1000), updatedAt: new Date(5000) }));
        seedSession(mkSession({ id: "b", createdAt: new Date(2000), updatedAt: new Date(3000) }));

        const res = await app.inject({ method: "GET", url: "/v1/sessions" });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.sessions.map((s: any) => s.id)).toEqual(["b", "a"]);
    });

    it("filters by since when provided and orders by updatedAt asc", async () => {
        seedSession(mkSession({ id: "a", updatedAt: new Date(1000) }));
        seedSession(mkSession({ id: "b", updatedAt: new Date(2000) }));
        seedSession(mkSession({ id: "c", updatedAt: new Date(3000) }));

        const res = await app.inject({ method: "GET", url: "/v1/sessions?since=1500" });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.sessions.map((s: any) => s.id)).toEqual(["b", "c"]);
        expect(body.sessions[0].updatedAt).toBe(2000);
        expect(body.sessions[1].updatedAt).toBe(3000);
    });

    it("returns empty array when since is newer than all updatedAt", async () => {
        seedSession(mkSession({ id: "a", updatedAt: new Date(1000) }));
        seedSession(mkSession({ id: "b", updatedAt: new Date(2000) }));

        const res = await app.inject({ method: "GET", url: "/v1/sessions?since=9000" });

        expect(res.statusCode).toBe(200);
        expect(res.json().sessions).toEqual([]);
    });

    it("returns deletion tombstones when since is provided", async () => {
        seedSession(mkSession({ id: "a", updatedAt: new Date(1000) }));
        state.deletions.push(
            { accountId: "user-1", sessionId: "deleted-old", deletedAt: new Date(1200) },
            { accountId: "user-1", sessionId: "deleted-new", deletedAt: new Date(2200) },
            { accountId: "other", sessionId: "deleted-other", deletedAt: new Date(3000) }
        );

        const res = await app.inject({ method: "GET", url: "/v1/sessions?since=1500" });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.sessions).toEqual([]);
        expect(body.deletedSessionIds).toEqual(["deleted-new"]);
        expect(body.cursor).toBe(2200);
    });

    it("rejects negative since", async () => {
        const res = await app.inject({ method: "GET", url: "/v1/sessions?since=-1" });
        expect(res.statusCode).toBe(400);
    });



    it("prioritizes since over older pagination when both are provided", async () => {
        seedSession(mkSession({ id: "old", updatedAt: new Date(1000) }));
        seedSession(mkSession({ id: "new", updatedAt: new Date(3000) }));

        const res = await app.inject({ method: "GET", url: "/v1/sessions?since=2000&beforeUpdatedAt=4000" });

        expect(res.statusCode).toBe(200);
        expect(res.json().sessions.map((session: any) => session.id)).toEqual(["new"]);
    });

    it("paginates older sessions without beforeId", async () => {
        seedSession(mkSession({ id: "a", updatedAt: new Date(3000) }));
        seedSession(mkSession({ id: "b", updatedAt: new Date(2000) }));
        seedSession(mkSession({ id: "c", updatedAt: new Date(1000) }));

        const res = await app.inject({ method: "GET", url: "/v1/sessions?beforeUpdatedAt=2500" });

        expect(res.statusCode).toBe(200);
        expect(res.json().sessions.map((session: any) => session.id)).toEqual(["b", "c"]);
    });

    it("rejects limit above 500", async () => {
        const res = await app.inject({ method: "GET", url: "/v1/sessions?beforeUpdatedAt=2500&limit=501" });
        expect(res.statusCode).toBe(400);
    });

    it("paginates older sessions by updatedAt and id", async () => {
        seedSession(mkSession({ id: "a", updatedAt: new Date(3000), createdAt: new Date(1000) }));
        seedSession(mkSession({ id: "c", updatedAt: new Date(2000), createdAt: new Date(2000) }));
        seedSession(mkSession({ id: "b", updatedAt: new Date(2000), createdAt: new Date(3000) }));
        seedSession(mkSession({ id: "d", updatedAt: new Date(1000), createdAt: new Date(4000) }));

        const res = await app.inject({ method: "GET", url: "/v1/sessions?beforeUpdatedAt=2000&beforeId=c&limit=2" });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.sessions.map((s: any) => s.id)).toEqual(["b", "d"]);
    });

    it("computes isShared from share count or publicShare", async () => {
        seedSession(mkSession({ id: "a", updatedAt: new Date(1000), shareCount: 2 }));
        seedSession(mkSession({ id: "b", updatedAt: new Date(2000), publicShareId: "ps1" }));
        seedSession(mkSession({ id: "c", updatedAt: new Date(3000) }));

        const res = await app.inject({ method: "GET", url: "/v1/sessions" });

        const body = res.json();
        const byId = Object.fromEntries(body.sessions.map((s: any) => [s.id, s.isShared]));
        expect(byId).toEqual({ a: true, b: true, c: false });
    });

    it("diff returns changed, missing, and tombstoned sessions", async () => {
        seedSession(mkSession({ id: "same", updatedAt: new Date(1000) }));
        seedSession(mkSession({ id: "changed", updatedAt: new Date(2500), metadata: "new" }));
        seedSession(mkSession({ id: "new-after-since", updatedAt: new Date(3000) }));
        state.deletions.push({ accountId: "user-1", sessionId: "deleted-after-since", deletedAt: new Date(3500) });

        const res = await app.inject({
            method: "POST",
            url: "/v1/sessions/diff",
            payload: {
                since: 2000,
                known: {
                    same: 1000,
                    changed: 2000,
                    missing: 1500
                }
            }
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.sessions.map((s: any) => s.id).sort()).toEqual(["changed", "new-after-since"]);
        expect(body.deletedSessionIds.sort()).toEqual(["deleted-after-since", "missing"]);
        expect(body.cursor).toBe(3500);
    });

    it("diff rejects too many known sessions", async () => {
        const known = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`s${i}`, 1]));

        const res = await app.inject({
            method: "POST",
            url: "/v1/sessions/diff",
            payload: { known }
        });

        expect(res.statusCode).toBe(413);
    });
});
