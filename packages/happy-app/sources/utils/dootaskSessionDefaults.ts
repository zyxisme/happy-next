export interface DooTaskExternalContextLike {
    source?: string;
    extra?: Record<string, unknown>;
}

export interface DooTaskSessionLike {
    createdAt?: number;
    updatedAt?: number;
    metadata?: {
        machineId?: string;
        path?: string;
        externalContext?: DooTaskExternalContextLike | null;
    } | null;
}

export function getDooTaskProjectId(data: { externalContext?: DooTaskExternalContextLike | null } | null): string | null {
    if (data?.externalContext?.source !== 'dootask') return null;
    const projectId = data.externalContext.extra?.projectId;
    if (projectId === undefined || projectId === null) return null;
    return String(projectId);
}

export function getRecentDooTaskProjectConfig(
    projectId: string | null,
    sessions: readonly (DooTaskSessionLike | string)[] | null,
    availableMachineIds: ReadonlySet<string>,
): { machineId: string; path: string } | null {
    if (!projectId || !sessions) return null;

    const matches: Array<{ machineId: string; path: string; timestamp: number }> = [];

    sessions.forEach(session => {
        if (typeof session === 'string') return;
        const metadata = session.metadata;
        const sessionProjectId = metadata?.externalContext?.extra?.projectId;
        const machineId = metadata?.machineId;
        const path = metadata?.path;

        if (
            metadata?.externalContext?.source === 'dootask' &&
            sessionProjectId !== undefined &&
            sessionProjectId !== null &&
            String(sessionProjectId) === projectId &&
            machineId &&
            path &&
            availableMachineIds.has(machineId)
        ) {
            matches.push({
                machineId,
                path,
                timestamp: session.createdAt ?? session.updatedAt ?? 0,
            });
        }
    });

    matches.sort((a, b) => b.timestamp - a.timestamp);
    const latest = matches[0];
    return latest ? { machineId: latest.machineId, path: latest.path } : null;
}
