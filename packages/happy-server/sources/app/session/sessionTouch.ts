import { Prisma } from "@prisma/client";

/**
 * Bumps Session.updatedAt so incremental /v1/sessions?since= picks up
 * related-table changes (shares, public shares) that don't otherwise
 * write to the Session row. Relies on Prisma's @updatedAt to write the
 * column on every update() regardless of data.
 */
export const touchSession = (tx: Prisma.TransactionClient, sessionId: string) =>
    tx.session.update({
        where: { id: sessionId },
        data: {}
    });
