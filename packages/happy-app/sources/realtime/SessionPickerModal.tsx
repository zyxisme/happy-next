// packages/happy-app/sources/realtime/SessionPickerModal.tsx
import { View, Text, Pressable, ScrollView } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { Modal } from '@/modal';
import { t } from '@/text';
import type { Session } from '@/sync/storageTypes';
import { storage } from '@/sync/storage';
import { getSessionName, isSessionOnline, formatPathRelativeToHome } from '@/utils/sessionUtils';
import { getCurrentRealtimeSessionId } from './RealtimeSession';
import { ModalRegistry, type RegisteredVoiceModal } from './voiceModalRegistry';

const PICKER_SAFETY_TIMEOUT_MS = 60_000;

export type SessionPickerIntent = 'switch' | 'delete';

export interface SessionPickerOptions {
    title: string;
    intent: SessionPickerIntent;
    /** Tap path: called when the user taps a row. Picker auto-closes after this resolves. */
    onSelect: (session: Session) => Promise<void> | void;
    /** Cancel path: tap-cancel button, safety timeout, or external dismiss. */
    onCancel?: () => void;
    includeOffline?: boolean;
}

interface SessionPickerContentProps {
    title: string;
    intent: SessionPickerIntent;
    sessions: Session[];
    onSelect: (s: Session) => void;
    onCancel: () => void;
}

function SessionPickerContent({ title, intent, sessions, onSelect, onCancel }: SessionPickerContentProps) {
    const { theme } = useUnistyles();
    const currentId = getCurrentRealtimeSessionId();
    const machines = storage.getState().machines;

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {sessions.map((s, i) => {
                    const machineId = s.metadata?.machineId;
                    const machine = machineId ? machines[machineId] : null;
                    const homeDir = machine?.metadata?.homeDir;
                    const path = formatPathRelativeToHome(s.metadata?.path ?? '', homeDir);
                    const isCurrent = s.id === currentId;
                    return (
                        <Pressable
                            key={s.id}
                            onPress={() => onSelect(s)}
                            style={({ pressed }) => [
                                styles.row,
                                { backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceHigh },
                            ]}
                        >
                            <Text style={[styles.rowIndex, { color: theme.colors.textSecondary }]}>{i + 1}.</Text>
                            <View style={styles.rowMain}>
                                <Text style={[styles.rowName, { color: theme.colors.text }]} numberOfLines={1}>
                                    {getSessionName(s)}{isCurrent ? ' (current)' : ''}
                                </Text>
                                {path ? (
                                    <Text style={[styles.rowPath, { color: theme.colors.textSecondary }]} numberOfLines={1}>
                                        {path}
                                    </Text>
                                ) : null}
                            </View>
                            {intent === 'delete' ? (
                                <Text style={[styles.rowMarker, { color: theme.colors.textDestructive }]}>×</Text>
                            ) : null}
                        </Pressable>
                    );
                })}
            </ScrollView>
            <Pressable
                style={({ pressed }) => [
                    styles.cancelButton,
                    { backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceHigh },
                ]}
                onPress={onCancel}
            >
                <Text style={[styles.cancelText, { color: theme.colors.textDestructive }]}>
                    {t('voiceActionConfirmation.cancel')}
                </Text>
            </Pressable>
        </View>
    );
}

function computeOrderedSessions(includeOffline: boolean | undefined): Session[] {
    const all = Object.values(storage.getState().sessions);
    const filtered = includeOffline ? all : all.filter(isSessionOnline);
    // Match listSessions: group by project path → machine → createdAt desc
    const machines = storage.getState().machines;
    const grouped = new Map<string, Map<string, Session[]>>();
    for (const s of filtered) {
        const project = s.metadata?.path ?? '';
        const machineId = s.metadata?.machineId ?? 'unknown';
        let byMachine = grouped.get(project);
        if (!byMachine) { byMachine = new Map(); grouped.set(project, byMachine); }
        const list = byMachine.get(machineId) ?? [];
        list.push(s);
        byMachine.set(machineId, list);
    }
    const projectKeys = Array.from(grouped.keys()).sort((a, b) => {
        const aPath = formatPathRelativeToHome(a, undefined);
        const bPath = formatPathRelativeToHome(b, undefined);
        return aPath.localeCompare(bPath);
    });
    const ordered: Session[] = [];
    for (const project of projectKeys) {
        const byMachine = grouped.get(project)!;
        const machineKeys = Array.from(byMachine.keys()).sort((a, b) => {
            const mA = machines[a]?.metadata?.displayName ?? a;
            const mB = machines[b]?.metadata?.displayName ?? b;
            return mA.localeCompare(mB);
        });
        for (const m of machineKeys) {
            const list = byMachine.get(m)!;
            list.sort((a, b) => b.createdAt - a.createdAt);
            ordered.push(...list);
        }
    }
    return ordered;
}

export interface SessionPickerHandle {
    close: () => void;
    orderedSessions: Session[];
}

export function showSessionPicker(opts: SessionPickerOptions): SessionPickerHandle {
    const sessions = computeOrderedSessions(opts.includeOffline);

    // Spec: 0 sessions → do not open an empty picker; let the caller speak the
    // empty-state reply.
    if (sessions.length === 0) {
        return { close: () => {}, orderedSessions: [] };
    }

    let resolved = false;
    let modalId: string | null = null;
    let safetyTimer: ReturnType<typeof setTimeout> | null = null;

    const finalize = (path: 'cancel' | 'select', session?: Session) => {
        if (resolved) return;
        resolved = true;
        if (safetyTimer !== null) clearTimeout(safetyTimer);
        ModalRegistry.unregister(handle);
        if (modalId !== null) Modal.hide(modalId);
        if (path === 'cancel') {
            opts.onCancel?.();
        } else if (session) {
            void opts.onSelect(session);
        }
    };

    const handle: RegisteredVoiceModal = {
        kind: 'picker',
        dismiss: () => finalize('cancel'),
    };

    modalId = Modal.show({
        component: SessionPickerContent,
        props: {
            title: opts.title,
            intent: opts.intent,
            sessions,
            onSelect: (s: Session) => finalize('select', s),
            onCancel: () => finalize('cancel'),
        },
    });

    ModalRegistry.register(handle);
    safetyTimer = setTimeout(() => finalize('cancel'), PICKER_SAFETY_TIMEOUT_MS);

    return {
        close: () => finalize('cancel'),
        orderedSessions: sessions,
    };
}

const styles = StyleSheet.create((theme) => ({
    container: {
        width: 320,
        maxHeight: 480,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: theme.colors.modal.border,
    },
    title: { fontSize: 17, textAlign: 'center', marginBottom: 12, ...Typography.default('semiBold') },
    list: { maxHeight: 360, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, marginBottom: 6 },
    rowIndex: { width: 24, fontSize: 15, ...Typography.default('semiBold') },
    rowMain: { flex: 1 },
    rowName: { fontSize: 15, ...Typography.default('semiBold') },
    rowPath: { fontSize: 12, marginTop: 2, ...Typography.default() },
    rowMarker: { fontSize: 22, marginLeft: 8, ...Typography.default('semiBold') },
    cancelButton: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    cancelText: { fontSize: 15, ...Typography.default('semiBold') },
}));
