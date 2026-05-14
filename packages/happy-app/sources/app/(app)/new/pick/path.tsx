import React, { useState, useMemo, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { ItemGroup } from '@/components/ItemGroup';
import { Item } from '@/components/Item';
import { Typography } from '@/constants/Typography';
import { useAllMachines, useSessions, useSetting } from '@/sync/storage';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { layout } from '@/components/layout';
import { t } from '@/text';
import { MultiTextInput, MultiTextInputHandle } from '@/components/MultiTextInput';
import { formatPathRelativeToHome } from '@/utils/sessionUtils';
import { resolveAbsolutePath } from '@/utils/pathUtils';
import { machineListDirectory, type MachineDirectoryEntry } from '@/sync/ops';

type CompletionKind = 'directories' | 'recent' | 'suggested';

type PathCompletion = {
    path: string;
    kind: CompletionKind;
};

const MAX_COMPLETIONS = 8;

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
    const trimmed = input.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('~')) {
        const resolved = resolveAbsolutePath(trimmed, homeDir);
        return resolved.startsWith('~') ? null : resolved;
    }

    if (isAbsolutePath(trimmed)) {
        return trimmed;
    }

    if (!homeDir) return null;

    if (trimmed === '.') return homeDir;
    if (trimmed.startsWith('./')) {
        return normalizeAbsolutePath(joinPathSegment(homeDir, trimmed.slice(2)));
    }
    if (trimmed === '..' || trimmed.startsWith('../')) {
        return normalizeAbsolutePath(joinPathSegment(homeDir, trimmed));
    }

    return null;
}

function getParentCompletionQuery(input: string, homeDir?: string): { parentDisplay: string; parentAbsolute: string; prefix: string } | null {
    const trimmed = input.trim();
    if (!trimmed || trimmed === '~') return null;
    if (!trimmed.includes('/') && !trimmed.includes('\\')) return null;

    const normalized = trimmed.replace(/\\/g, '/');
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash < 0) return null;

    const parentDisplay = lastSlash === 0 ? '/' : normalized.slice(0, lastSlash);
    const prefix = normalized.slice(lastSlash + 1);
    const parentAbsolute = toAbsolutePathForList(parentDisplay, homeDir);
    if (!parentAbsolute) return null;

    return { parentDisplay, parentAbsolute, prefix };
}

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.groupped.background,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        alignItems: 'center',
    },
    contentWrapper: {
        width: '100%',
        maxWidth: layout.maxWidth,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyText: {
        fontSize: 16,
        color: theme.colors.textSecondary,
        textAlign: 'center',
        ...Typography.default(),
    },
    pathInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 16,
    },
    pathInput: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.input.background,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minHeight: 36,
        borderWidth: 0.5,
        borderColor: theme.colors.divider,
    },
    pathInputField: {
        flex: 1,
    },
    pathInputSpinner: {
        marginLeft: 10,
        transform: [{ scale: 0.8 }],
    },
    pathIconSlot: {
        width: 18,
        height: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },
}));

export default function PathPickerScreen() {
    const { theme } = useUnistyles();
    const styles = stylesheet;
    const router = useRouter();
    const navigation = useNavigation();
    const params = useLocalSearchParams<{ machineId?: string; selectedPath?: string }>();
    const machines = useAllMachines();
    const sessions = useSessions();
    const inputRef = useRef<MultiTextInputHandle>(null);
    const recentMachinePaths = useSetting('recentMachinePaths');

    const [customPath, setCustomPath] = useState(() => {
        if (!params.selectedPath) return '';
        const m = machines.find(m => m.id === params.machineId);
        return formatPathRelativeToHome(params.selectedPath, m?.metadata?.homeDir);
    });
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [directoryCompletions, setDirectoryCompletions] = useState<PathCompletion[]>([]);
    const [isLoadingCompletions, setIsLoadingCompletions] = useState(false);
    const directoryCacheRef = useRef(new Map<string, { entries: MachineDirectoryEntry[]; expiresAt: number }>());

    const machine = useMemo(() => {
        return machines.find(m => m.id === params.machineId);
    }, [machines, params.machineId]);

    const recentPaths = useMemo(() => {
        if (!params.machineId) return [];

        const paths: string[] = [];
        const pathSet = new Set<string>();

        recentMachinePaths.forEach(entry => {
            if (entry.machineId === params.machineId && !pathSet.has(entry.path)) {
                paths.push(entry.path);
                pathSet.add(entry.path);
            }
        });

        if (sessions) {
            const pathsWithTimestamps: Array<{ path: string; timestamp: number }> = [];

            sessions.forEach(item => {
                if (typeof item === 'string') return;

                const session = item as any;
                if (session.metadata?.machineId === params.machineId && session.metadata?.path) {
                    const path = session.metadata.path;
                    if (!pathSet.has(path)) {
                        pathSet.add(path);
                        pathsWithTimestamps.push({
                            path,
                            timestamp: session.updatedAt || session.createdAt
                        });
                    }
                }
            });

            pathsWithTimestamps
                .sort((a, b) => b.timestamp - a.timestamp)
                .forEach(item => paths.push(item.path));
        }

        return paths;
    }, [sessions, params.machineId, recentMachinePaths]);

    const homeDir = machine?.metadata?.homeDir;

    const defaultSuggestedCompletions = React.useMemo<PathCompletion[]>(() => ([
        '~',
        '~/projects',
        '~/Documents',
        '~/Desktop'
    ].map((path) => ({ path, kind: 'suggested' as const }))), []);

    const recentPathCompletions = React.useMemo<PathCompletion[]>(() => {
        const query = customPath.trim().toLowerCase();
        if (!query) {
            return recentPaths.slice(0, MAX_COMPLETIONS).map((path) => ({
                path: formatPathRelativeToHome(path, homeDir),
                kind: 'recent',
            }));
        }

        return recentPaths
            .map((path) => formatPathRelativeToHome(path, homeDir))
            .filter((path) => {
                const normalized = path.toLowerCase();
                return normalized.includes(query) || resolveAbsolutePath(path, homeDir).toLowerCase().includes(query);
            })
            .slice(0, MAX_COMPLETIONS)
            .map((path) => ({ path, kind: 'recent' }));
    }, [customPath, homeDir, recentPaths]);

    React.useEffect(() => {
        if (!isInputFocused || !params.machineId) {
            setDirectoryCompletions([]);
            setIsLoadingCompletions(false);
            return;
        }

        const input = customPath.trim();
        if (!input) {
            setDirectoryCompletions([]);
            setIsLoadingCompletions(false);
            return;
        }

        let cancelled = false;

        const readDirectory = async (absolutePath: string): Promise<MachineDirectoryEntry[] | null> => {
            const cached = directoryCacheRef.current.get(absolutePath);
            const now = Date.now();
            if (cached && cached.expiresAt > now) {
                return cached.entries;
            }

            const response = await machineListDirectory(params.machineId!, absolutePath);
            if (!response.success || !response.entries) {
                return null;
            }

            directoryCacheRef.current.set(absolutePath, {
                entries: response.entries,
                expiresAt: now + 30_000,
            });
            return response.entries;
        };

        const buildDirectoryCompletions = (
            entries: MachineDirectoryEntry[],
            parentDisplay: string,
            prefix = ''
        ): PathCompletion[] => {
            const lowerPrefix = prefix.toLowerCase();
            return entries
                .filter((entry) => entry.type === 'directory')
                .filter((entry) => !lowerPrefix || entry.name.toLowerCase().startsWith(lowerPrefix))
                .slice(0, MAX_COMPLETIONS)
                .map((entry) => ({
                    path: joinPathSegment(normalizeDisplayPath(parentDisplay), entry.name),
                    kind: 'directories' as const,
                }));
        };

        const timer = setTimeout(() => {
            setIsLoadingCompletions(true);

            (async () => {
                const absoluteInput = toAbsolutePathForList(input, homeDir);
                if (absoluteInput) {
                    const childEntries = await readDirectory(absoluteInput);
                    if (cancelled) return;
                    if (childEntries) {
                        setDirectoryCompletions(buildDirectoryCompletions(childEntries, input));
                        setIsLoadingCompletions(false);
                        return;
                    }
                }

                const parentQuery = getParentCompletionQuery(input, homeDir);
                if (parentQuery) {
                    const parentEntries = await readDirectory(parentQuery.parentAbsolute);
                    if (cancelled) return;
                    if (parentEntries) {
                        setDirectoryCompletions(buildDirectoryCompletions(parentEntries, parentQuery.parentDisplay, parentQuery.prefix));
                        setIsLoadingCompletions(false);
                        return;
                    }
                }

                setDirectoryCompletions([]);
                setIsLoadingCompletions(false);
            })().catch(() => {
                if (cancelled) return;
                setDirectoryCompletions([]);
                setIsLoadingCompletions(false);
            });
        }, 200);

        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [customPath, homeDir, isInputFocused, params.machineId]);

    const recommendedPaths = React.useMemo<PathCompletion[]>(() => {
        const trimmed = customPath.trim();

        if (!isInputFocused) {
            return recentPaths.length > 0
                ? recentPaths.slice(0, MAX_COMPLETIONS).map((path) => ({
                    path: formatPathRelativeToHome(path, homeDir),
                    kind: 'recent' as const,
                }))
                : defaultSuggestedCompletions;
        }

        let baseList: PathCompletion[];
        if (trimmed) {
            baseList = directoryCompletions.length > 0
                ? directoryCompletions
                : recentPathCompletions;
        } else {
            baseList = recentPaths.length > 0
                ? recentPaths.slice(0, MAX_COMPLETIONS).map((path) => ({
                    path: formatPathRelativeToHome(path, homeDir),
                    kind: 'recent' as const,
                }))
                : defaultSuggestedCompletions;
        }

        if (!trimmed) return baseList;
        if (baseList.some((c) => c.path === trimmed)) return baseList;
        return [{ path: trimmed, kind: 'directories' as const }, ...baseList];
    }, [
        customPath,
        defaultSuggestedCompletions,
        directoryCompletions,
        homeDir,
        isInputFocused,
        recentPathCompletions,
        recentPaths,
    ]);

    const recommendedTitle = isInputFocused && customPath.trim()
        ? t('wizard.directorySuggestions')
        : recentPaths.length > 0 ? t('wizard.recentPaths') : t('wizard.suggestedPaths');

    const renderPathIcon = React.useCallback(() => (
        <View style={styles.pathIconSlot}>
            <Ionicons
                name="folder-outline"
                size={18}
                color={theme.colors.textSecondary}
            />
        </View>
    ), [styles.pathIconSlot, theme.colors.textSecondary]);

    const handleSelectPath = React.useCallback(() => {
        const rawPath = customPath.trim() || machine?.metadata?.homeDir || '/home';
        const pathToUse = resolveAbsolutePath(rawPath, homeDir);
        const state = navigation.getState();
        const previousRoute = state?.routes?.[state.index - 1];
        if (state && state.index > 0 && previousRoute) {
            navigation.dispatch({
                ...CommonActions.setParams({ path: pathToUse }),
                source: previousRoute.key,
            } as never);
        }
        router.back();
    }, [customPath, router, machine, navigation, homeDir]);

    const renderRecommendedItems = React.useCallback(() => {
        if (recommendedPaths.length > 0) {
            return recommendedPaths.map((completion, index) => (
                <Item
                    key={`${completion.kind}:${completion.path}`}
                    title={completion.path}
                    leftElement={renderPathIcon()}
                    onPress={() => {
                        if (completion.path === customPath.trim()) {
                            handleSelectPath();
                            return;
                        }
                        setCustomPath(completion.path);
                        inputRef.current?.focus();
                    }}
                    showChevron={false}
                    showDivider={index < recommendedPaths.length - 1}
                />
            ));
        }

        return (
            <Item
                title={t('wizard.noMatchingDirectories')}
                leftElement={
                    <View style={styles.pathIconSlot}>
                        <Ionicons
                            name="search-outline"
                            size={18}
                            color={theme.colors.textSecondary}
                        />
                    </View>
                }
                disabled
                hideSelectedCheckmark
                showChevron={false}
                showDivider={false}
            />
        );
    }, [
        customPath,
        handleSelectPath,
        recommendedPaths,
        renderPathIcon,
        styles.pathIconSlot,
        theme.colors.textSecondary,
    ]);

    if (!machine) {
        return (
            <>
                <Stack.Screen
                    options={{
                        headerShown: true,
                        headerTitle: t('wizard.selectPath'),
                        headerRight: () => (
                            <Pressable
                                onPress={handleSelectPath}
                                disabled={!customPath.trim()}
                                style={({ pressed }) => ({
                                    marginRight: 16,
                                    opacity: pressed ? 0.7 : 1,
                                    padding: 4,
                                })}
                            >
                                <Ionicons
                                    name="checkmark"
                                    size={24}
                                    color={theme.colors.header.tint}
                                />
                            </Pressable>
                        )
                    }}
                />
                <View style={styles.container}>
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>
                            {t('wizard.noMachineSelected')}
                        </Text>
                    </View>
                </View>
            </>
        );
    }

    return (
        <>
            <Stack.Screen
                options={{
                    headerShown: true,
                    headerTitle: t('wizard.selectPath'),
                    headerRight: () => (
                        <Pressable
                            onPress={handleSelectPath}
                            disabled={!customPath.trim()}
                            style={({ pressed }) => ({
                                opacity: pressed ? 0.7 : 1,
                                padding: 4,
                            })}
                        >
                            <Ionicons
                                name="checkmark"
                                size={24}
                                color={theme.colors.header.tint}
                            />
                        </Pressable>
                    )
                }}
            />
            <View style={styles.container}>
                <ScrollView
                    style={styles.scrollContainer}
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                    automaticallyAdjustKeyboardInsets
                >
                    <View style={styles.contentWrapper}>
                        <ItemGroup title={t('wizard.enterPath')}>
                            <View style={styles.pathInputContainer}>
                                <View style={styles.pathInput}>
                                    <View style={styles.pathInputField}>
                                        <MultiTextInput
                                            ref={inputRef}
                                            value={customPath}
                                            onChangeText={setCustomPath}
                                            onFocus={() => setIsInputFocused(true)}
                                            placeholder={t('wizard.enterPathPlaceholder')}
                                            maxHeight={76}
                                            paddingTop={8}
                                            paddingBottom={8}
                                            autoCapitalize="none"
                                            autoCorrect={false}
                                        />
                                    </View>
                                    {isLoadingCompletions && (
                                        <ActivityIndicator
                                            size="small"
                                            color={theme.colors.textSecondary}
                                            style={styles.pathInputSpinner}
                                        />
                                    )}
                                </View>
                            </View>
                        </ItemGroup>

                        <ItemGroup title={recommendedTitle}>
                            {renderRecommendedItems()}
                        </ItemGroup>
                    </View>
                </ScrollView>
            </View>
        </>
    );
}
