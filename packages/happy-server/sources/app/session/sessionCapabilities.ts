import { Prisma } from "@prisma/client";
import { db } from "@/storage/db";
import { buildUpdateSessionUpdate, eventRouter } from "@/app/events/eventRouter";
import { randomKeyNaked } from "@/utils/randomKeyNaked";

export type SessionCapabilitiesUpdateResult =
    | { result: 'success'; version: number; payload: string }
    | { result: 'version-mismatch'; version: number; payload: string | null };

export async function updateSessionCapabilitiesAtomic(
    sessionId: string,
    payload: string,
    expectedVersion: number
): Promise<SessionCapabilitiesUpdateResult> {
    const nextVersion = expectedVersion + 1;

    const updated = await db.sessionCapabilities.updateMany({
        where: { sessionId, version: expectedVersion },
        data: { payload, version: nextVersion }
    });
    if (updated.count === 1) {
        return { result: 'success', version: nextVersion, payload };
    }

    const existing = await db.sessionCapabilities.findUnique({
        where: { sessionId },
        select: { version: true, payload: true }
    });
    if (existing) {
        return { result: 'version-mismatch', version: existing.version, payload: existing.payload };
    }

    if (expectedVersion !== 0) {
        return { result: 'version-mismatch', version: 0, payload: null };
    }

    try {
        await db.sessionCapabilities.create({
            data: { sessionId, payload, version: nextVersion }
        });
        return { result: 'success', version: nextVersion, payload };
    } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const current = await db.sessionCapabilities.findUnique({
                where: { sessionId },
                select: { version: true, payload: true }
            });
            return {
                result: 'version-mismatch',
                version: current?.version ?? 0,
                payload: current?.payload ?? null
            };
        }
        throw error;
    }
}

export async function emitSessionCapabilitiesUpdate(params: {
    ownerId: string;
    sessionId: string;
    payload: string;
    version: number;
}) {
    const capabilitiesUpdate = {
        value: params.payload,
        version: params.version
    };

    await eventRouter.emitToSessionSubscribers({
        ownerId: params.ownerId,
        sessionId: params.sessionId,
        buildPayload: (_uid, seq) => buildUpdateSessionUpdate(
            params.sessionId,
            seq,
            randomKeyNaked(12),
            undefined,
            undefined,
            capabilitiesUpdate
        ),
        recipientFilter: { type: 'all-interested-in-session', sessionId: params.sessionId }
    });
}
