import * as React from 'react';
import { resolveAbsolutePath } from './pathUtils';
import { machineListDirectory, type MachineDirectoryEntry } from '@/sync/ops';

const DEBOUNCE_MS = 200;
const CACHE_MS = 30_000;
const CACHE_LIMIT = 64;
const DEFAULT_MAX_COMPLETIONS = 8;

const EMPTY_COMPLETIONS: string[] = [];

function isAbsolutePath(path: string): boolean {
    return path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path);
}

function trimTrailingSeparators(path: string): string {
    if (path === '/' || /^[A-Za-z]:[\\/]?$/.test(path)) {
        return path;
    }
    return path.replace(/[\\/]+$/, '');
}

function joinPathSegment(base: string, segment: string): string {
    if (!base || base === '.') return segment;
    if (base === '~') return `~/${segment}`;
    if (base === '/') return `/${segment}`;
    return `${trimTrailingSeparators(base)}/${segment}`;
}

function normalizeDisplayPath(path: string): string {
    if (path === '~') return path;
    return trimTrailingSeparators(path);
}

function normalizeAbsolutePath(path: string): string {
    const isWindows = /^[A-Za-z]:[\\/]/.test(path);
    const separator = isWindows ? '\\' : '/';
    const parts: string[] = [];
    const prefix = isWindows ? path.slice(0, 2) : path.startsWith('/') ? '/' : '';
    const rest = isWindows ? path.slice(2).replace(/^[\\/]+/, '') : path.replace(/^\/+/, '');

    rest.split(/[\\/]+/).forEach((part) => {
        if (!part || part === '.') return;
        if (part === '..') {
            parts.pop();
            return;
        }
        parts.push(part);
    });

    if (isWindows) {
        return `${prefix}${separator}${parts.join(separator)}`;
    }
    return `${prefix}${parts.join(separator)}` || '/';
}

function toAbsolutePathForList(input: string, homeDir?: string): string | null {
    if (!input) return null;

    if (input.startsWith('~')) {
        const resolved = resolveAbsolutePath(input, homeDir);
        return resolved.startsWith('~') ? null : resolved;
    }

    if (isAbsolutePath(input)) {
        return input;
    }

    if (!homeDir) return null;

    if (input === '.') return homeDir;
    if (input.startsWith('./')) {
        return normalizeAbsolutePath(joinPathSegment(homeDir, input.slice(2)));
    }
    if (input === '..' || input.startsWith('../')) {
        return normalizeAbsolutePath(joinPathSegment(homeDir, input));
    }

    return null;
}

function getParentCompletionQuery(input: string, homeDir?: string): { parentDisplay: string; parentAbsolute: string; prefix: string } | null {
    if (!input || input === '~') return null;
    if (!input.includes('/') && !input.includes('\\')) return null;

    const normalized = input.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash < 0) return null;

    const parentDisplay = lastSlash === 0 ? '/' : normalized.slice(0, lastSlash);
    const prefix = normalized.slice(lastSlash + 1);
    const parentAbsolute = toAbsolutePathForList(parentDisplay, homeDir);
    if (!parentAbsolute) return null;

    return { parentDisplay, parentAbsolute, prefix };
}

type CacheEntry = { entries: MachineDirectoryEntry[]; expiresAt: number };

export type DirectoryCompletionOptions = {
    machineId: string | undefined;
    input: string;
    homeDir: string | undefined;
    enabled?: boolean;
};

export type DirectoryCompletionResult = {
    completions: string[];
    loading: boolean;
};

/**
 * Returns display-form directory paths (with ~ when applicable). Pass `enabled: false`
 * to suppress fetches without unmounting.
 */
export function useDirectoryCompletions(opts: DirectoryCompletionOptions): DirectoryCompletionResult {
    const { machineId, input, homeDir, enabled = true } = opts;

    const [completions, setCompletions] = React.useState<string[]>(EMPTY_COMPLETIONS);
    const [loading, setLoading] = React.useState(false);
    const cacheRef = React.useRef<Map<string, CacheEntry> | null>(null);
    if (cacheRef.current === null) cacheRef.current = new Map();
    const cache = cacheRef.current;

    const trimmedInput = React.useMemo(() => input.trim(), [input]);

    const resetState = React.useCallback(() => {
        setCompletions((prev) => (prev.length === 0 ? prev : EMPTY_COMPLETIONS));
        setLoading(false);
    }, []);

    React.useEffect(() => {
        if (!enabled || !machineId || !trimmedInput) {
            resetState();
            return;
        }

        let cancelled = false;

        const readDirectory = async (absolutePath: string): Promise<MachineDirectoryEntry[] | null> => {
            const cached = cache.get(absolutePath);
            const now = Date.now();
            if (cached && cached.expiresAt > now) return cached.entries;

            const response = await machineListDirectory(machineId, absolutePath);
            if (!response.success || !response.entries) return null;

            if (cache.size >= CACHE_LIMIT) {
                const oldest = cache.keys().next().value;
                if (oldest !== undefined) cache.delete(oldest);
            }
            cache.set(absolutePath, { entries: response.entries, expiresAt: now + CACHE_MS });
            return response.entries;
        };

        const buildCompletions = (entries: MachineDirectoryEntry[], parentDisplay: string, prefix = ''): string[] => {
            const lowerPrefix = prefix.toLowerCase();
            return entries
                .filter((entry) => entry.type === 'directory')
                .filter((entry) => !lowerPrefix || entry.name.toLowerCase().startsWith(lowerPrefix))
                .slice(0, DEFAULT_MAX_COMPLETIONS)
                .map((entry) => joinPathSegment(normalizeDisplayPath(parentDisplay), entry.name));
        };

        const timer = setTimeout(() => {
            setLoading(true);
            (async () => {
                const absoluteInput = toAbsolutePathForList(trimmedInput, homeDir);
                if (absoluteInput) {
                    const childEntries = await readDirectory(absoluteInput);
                    if (cancelled) return;
                    if (childEntries) {
                        setCompletions(buildCompletions(childEntries, trimmedInput));
                        setLoading(false);
                        return;
                    }
                }

                const parentQuery = getParentCompletionQuery(trimmedInput, homeDir);
                if (parentQuery) {
                    const parentEntries = await readDirectory(parentQuery.parentAbsolute);
                    if (cancelled) return;
                    if (parentEntries) {
                        setCompletions(buildCompletions(parentEntries, parentQuery.parentDisplay, parentQuery.prefix));
                        setLoading(false);
                        return;
                    }
                }

                if (cancelled) return;
                resetState();
            })().catch(() => {
                if (cancelled) return;
                resetState();
            });
        }, DEBOUNCE_MS);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [cache, enabled, homeDir, machineId, resetState, trimmedInput]);

    return { completions, loading };
}
