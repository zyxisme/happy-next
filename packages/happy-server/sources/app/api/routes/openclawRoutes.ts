import { db } from "@/storage/db";
import { Fastify } from "../types";
import { z } from "zod";
import { log } from "@/utils/log";
import * as privacyKit from "privacy-kit";
import { OpenClawMachine } from "@prisma/client";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { allocateUserSeq } from "@/storage/seq";
import {
    eventRouter,
    buildNewOpenClawMachineUpdate,
    buildUpdateOpenClawMachineUpdate,
    buildDeleteOpenClawMachineUpdate
} from "@/app/events/eventRouter";

/**
 * OpenClaw Machine Routes
 *
 * Provides CRUD operations for OpenClaw machines. OpenClaw machines can be of two types:
 * - 'happy': Relay through a Happy device (requires happyMachineId)
 * - 'direct': Direct WebSocket connection (requires directConfig)
 *
 * All sensitive fields (metadata, directConfig, pairingData) are encrypted on the client side
 * and stored as-is on the server. The dataEncryptionKey is stored for key management purposes.
 *
 * Optimistic concurrency control is supported via expectedMetadataVersion for updates.
 */

/**
 * Format OpenClaw machine for API response
 */
function isUniqueConstraintError(error: unknown): boolean {
    return !!error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

function formatOpenClawMachine(m: OpenClawMachine) {
    return {
        id: m.id,
        type: m.type,
        happyMachineId: m.happyMachineId,
        directConfig: m.directConfig,
        metadata: m.metadata,
        metadataVersion: m.metadataVersion,
        pairingData: m.pairingData,
        dataEncryptionKey: m.dataEncryptionKey ? privacyKit.encodeBase64(m.dataEncryptionKey) : null,
        seq: m.seq,
        createdAt: m.createdAt.getTime(),
        updatedAt: m.updatedAt.getTime()
    };
}

export function openclawRoutes(app: Fastify) {
    // GET /v1/openclaw/machines - List all OpenClaw machines for the account
    app.get('/v1/openclaw/machines', {
        preHandler: app.authenticate,
    }, async (request, reply) => {
        const userId = request.userId;

        try {
            const machines = await db.openClawMachine.findMany({
                where: { accountId: userId },
                orderBy: { updatedAt: 'desc' }
            });

            return machines.map(formatOpenClawMachine);
        } catch (error) {
            log({ module: 'openclaw', level: 'error' }, `Failed to list OpenClaw machines: ${error}`);
            return reply.code(500).send({ error: 'Failed to list machines' });
        }
    });

    // POST /v1/openclaw/machines - Create new OpenClaw machine
    app.post('/v1/openclaw/machines', {
        preHandler: app.authenticate,
        schema: {
            body: z.object({
                type: z.enum(['happy', 'direct']),
                happyMachineId: z.string().optional(),
                directConfig: z.string().optional(),
                metadata: z.string(),
                pairingData: z.string().optional(),
                dataEncryptionKey: z.string().optional(),
                // Optional client-supplied key so a network retry dedupes to one machine.
                idempotencyKey: z.string().min(1).max(128).optional()
            })
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { type, happyMachineId, directConfig, metadata, pairingData, dataEncryptionKey, idempotencyKey } = request.body;

        // Validate type-specific requirements
        if (type === 'happy' && !happyMachineId) {
            return reply.code(400).send({ error: 'happyMachineId is required when type is happy' });
        }
        if (type === 'direct' && !directConfig) {
            return reply.code(400).send({ error: 'directConfig is required when type is direct' });
        }

        // Idempotent create: if a machine with this key already exists, return it
        // without creating a duplicate or re-emitting the new-machine event.
        const loadExistingByKey = async (): Promise<OpenClawMachine | null> => {
            if (!idempotencyKey) {
                return null;
            }
            return db.openClawMachine.findFirst({
                where: { accountId: userId, idempotencyKey }
            });
        };

        try {
            const existing = await loadExistingByKey();
            if (existing) {
                return reply.send({ machine: formatOpenClawMachine(existing) });
            }

            log({ module: 'openclaw', userId }, 'Creating new OpenClaw machine');

            let machine: OpenClawMachine;
            try {
                machine = await db.openClawMachine.create({
                    data: {
                        accountId: userId,
                        type,
                        happyMachineId: type === 'happy' ? happyMachineId : null,
                        directConfig: type === 'direct' ? directConfig : null,
                        metadata,
                        metadataVersion: 1,
                        pairingData: pairingData || null,
                        dataEncryptionKey: dataEncryptionKey ? privacyKit.decodeBase64(dataEncryptionKey) : null,
                        idempotencyKey: idempotencyKey ?? null,
                        seq: 0
                    }
                });
            } catch (error) {
                // Concurrent request with the same key won the race: return the winner.
                if (idempotencyKey && isUniqueConstraintError(error)) {
                    const winner = await loadExistingByKey();
                    if (winner) {
                        return reply.send({ machine: formatOpenClawMachine(winner) });
                    }
                }
                throw error;
            }

            // Emit new-openclaw-machine event
            const updSeq = await allocateUserSeq(userId);
            const newMachinePayload = buildNewOpenClawMachineUpdate(machine, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: newMachinePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                machine: formatOpenClawMachine(machine)
            });
        } catch (error) {
            log({ module: 'openclaw', level: 'error' }, `Failed to create OpenClaw machine: ${error}`);
            return reply.code(500).send({ error: 'Failed to create machine' });
        }
    });

    // GET /v1/openclaw/machines/:id - Get single OpenClaw machine by ID
    app.get('/v1/openclaw/machines/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                id: z.string()
            })
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            const machine = await db.openClawMachine.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!machine) {
                return reply.code(404).send({ error: 'OpenClaw machine not found' });
            }

            return {
                machine: formatOpenClawMachine(machine)
            };
        } catch (error) {
            log({ module: 'openclaw', level: 'error' }, `Failed to get OpenClaw machine: ${error}`);
            return reply.code(500).send({ error: 'Failed to get machine' });
        }
    });

    // PUT /v1/openclaw/machines/:id - Update OpenClaw machine
    app.put('/v1/openclaw/machines/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                id: z.string()
            }),
            body: z.object({
                metadata: z.string().optional(),
                expectedMetadataVersion: z.number().int().min(0).optional(),
                pairingData: z.string().optional(),
                directConfig: z.string().optional()
            })
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;
        const { metadata, expectedMetadataVersion, pairingData, directConfig } = request.body;

        try {
            // Get current machine for version check
            const currentMachine = await db.openClawMachine.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!currentMachine) {
                return reply.code(404).send({ error: 'OpenClaw machine not found' });
            }

            // Check metadata version mismatch (optimistic concurrency control)
            if (metadata !== undefined && expectedMetadataVersion !== undefined) {
                if (currentMachine.metadataVersion !== expectedMetadataVersion) {
                    return reply.code(409).send({
                        error: 'version-mismatch',
                        currentMetadataVersion: currentMachine.metadataVersion,
                        currentMetadata: currentMachine.metadata
                    });
                }
            }

            // Validate directConfig target before deciding whether anything changed.
            if (directConfig !== undefined && currentMachine.type !== 'direct') {
                return reply.code(400).send({ error: 'directConfig can only be updated for direct type machines' });
            }

            // Build update data, only including fields whose value actually changes.
            // This keeps the endpoint idempotent: replaying the same body (e.g. a network
            // retry) does NOT bump `seq` or emit a duplicate event when nothing differs.
            const updateData: {
                metadata?: string;
                metadataVersion?: number;
                pairingData?: string;
                directConfig?: string;
                seq?: number;
                updatedAt?: Date;
            } = {};

            if (metadata !== undefined && expectedMetadataVersion !== undefined && metadata !== currentMachine.metadata) {
                updateData.metadata = metadata;
                updateData.metadataVersion = expectedMetadataVersion + 1;
            }

            if (pairingData !== undefined && pairingData !== currentMachine.pairingData) {
                updateData.pairingData = pairingData;
            }

            if (directConfig !== undefined && directConfig !== currentMachine.directConfig) {
                updateData.directConfig = directConfig;
            }

            const hasChanges = updateData.metadata !== undefined
                || updateData.pairingData !== undefined
                || updateData.directConfig !== undefined;

            // No-op update: return current state without bumping seq or emitting.
            if (!hasChanges) {
                return reply.send({
                    success: true,
                    machine: formatOpenClawMachine(currentMachine)
                });
            }

            updateData.seq = currentMachine.seq + 1;
            updateData.updatedAt = new Date();

            // Update machine
            const updatedMachine = await db.openClawMachine.update({
                where: { id },
                data: updateData
            });

            // Emit update-openclaw-machine event
            const updSeq = await allocateUserSeq(userId);
            const eventUpdates: {
                metadata?: { value: string; version: number };
                pairingData?: string | null;
                directConfig?: string | null;
            } = {};
            if (updateData.metadata !== undefined && updateData.metadataVersion !== undefined) {
                eventUpdates.metadata = { value: updateData.metadata, version: updateData.metadataVersion };
            }
            if (updateData.pairingData !== undefined) {
                eventUpdates.pairingData = updateData.pairingData;
            }
            if (updateData.directConfig !== undefined) {
                eventUpdates.directConfig = updateData.directConfig;
            }
            const updatePayload = buildUpdateOpenClawMachineUpdate(id, updSeq, randomKeyNaked(12), eventUpdates);
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({
                success: true,
                machine: formatOpenClawMachine(updatedMachine)
            });
        } catch (error) {
            log({ module: 'openclaw', level: 'error' }, `Failed to update OpenClaw machine: ${error}`);
            return reply.code(500).send({ error: 'Failed to update machine' });
        }
    });

    // DELETE /v1/openclaw/machines/:id - Delete OpenClaw machine
    app.delete('/v1/openclaw/machines/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({
                id: z.string()
            })
        }
    }, async (request, reply) => {
        const userId = request.userId;
        const { id } = request.params;

        try {
            // Check if machine exists and belongs to user
            const machine = await db.openClawMachine.findFirst({
                where: {
                    id,
                    accountId: userId
                }
            });

            if (!machine) {
                return reply.code(404).send({ error: 'OpenClaw machine not found' });
            }

            log({ module: 'openclaw', userId, machineId: id }, 'Deleting OpenClaw machine');

            // Delete machine
            await db.openClawMachine.delete({
                where: { id }
            });

            // Emit delete-openclaw-machine event
            const updSeq = await allocateUserSeq(userId);
            const deletePayload = buildDeleteOpenClawMachineUpdate(id, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: deletePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });

            return reply.send({ success: true });
        } catch (error) {
            log({ module: 'openclaw', level: 'error' }, `Failed to delete OpenClaw machine: ${error}`);
            return reply.code(500).send({ error: 'Failed to delete machine' });
        }
    });
}
