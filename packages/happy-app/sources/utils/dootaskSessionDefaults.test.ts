import { describe, expect, it } from 'vitest';
import { getDooTaskProjectId, getRecentDooTaskProjectConfig } from './dootaskSessionDefaults';

describe('dootaskSessionDefaults', () => {
    it('reads project id from DooTask external context', () => {
        expect(getDooTaskProjectId({
            externalContext: {
                source: 'dootask',
                extra: { projectId: 123 },
            } as any,
        } as any)).toBe('123');
    });

    it('returns null for non-DooTask context', () => {
        expect(getDooTaskProjectId({
            externalContext: {
                source: 'github',
                extra: { projectId: 123 },
            } as any,
        } as any)).toBeNull();
    });

    it('picks the most recent matching machine/path pair', () => {
        const result = getRecentDooTaskProjectConfig(
            '42',
            [
                {
                    createdAt: 100,
                    metadata: {
                        machineId: 'machine-a',
                        path: '/old',
                        externalContext: {
                            source: 'dootask',
                            extra: { projectId: 42 },
                        },
                    },
                },
                {
                    createdAt: 200,
                    metadata: {
                        machineId: 'machine-b',
                        path: '/new',
                        externalContext: {
                            source: 'dootask',
                            extra: { projectId: '42' },
                        },
                    },
                },
            ],
            new Set(['machine-a', 'machine-b']),
        );

        expect(result).toEqual({ machineId: 'machine-b', path: '/new' });
    });

    it('ignores sessions for other projects or unavailable machines', () => {
        const result = getRecentDooTaskProjectConfig(
            '42',
            [
                {
                    createdAt: 300,
                    metadata: {
                        machineId: 'machine-x',
                        path: '/other',
                        externalContext: {
                            source: 'dootask',
                            extra: { projectId: 999 },
                        },
                    },
                },
                {
                    createdAt: 400,
                    metadata: {
                        machineId: 'machine-y',
                        path: '/missing',
                        externalContext: {
                            source: 'dootask',
                            extra: { projectId: 42 },
                        },
                    },
                },
            ],
            new Set(['machine-z']),
        );

        expect(result).toBeNull();
    });
});
