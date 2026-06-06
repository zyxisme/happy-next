import * as React from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { BottomSheetModal, BottomSheetView, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import * as Clipboard from 'expo-clipboard';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Ionicons } from '@expo/vector-icons';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import type { OpenClawSession } from '@/openclaw/types';

/** Relative time label, mirrors the formatter used in the machine detail page. */
function formatRelativeTime(timestamp: number | null): string {
    if (!timestamp) return '—';
    const diffMs = Date.now() - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return t('time.justNow');
    if (diffMins < 60) return t('time.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('time.hoursAgo', { count: diffHours });
    return t('sessionHistory.daysAgo', { count: diffDays });
}

/** Localized label for the session kind. */
function kindLabel(kind: OpenClawSession['kind'] | undefined): string {
    switch (kind) {
        case 'direct': return t('openclaw.sessionTypeDirect');
        case 'global': return t('openclaw.sessionTypeGlobal');
        case 'group': return t('openclaw.sessionTypeGroup');
        default: return '—';
    }
}

type Props = {
    session: OpenClawSession | null;
    machineName?: string;
    loading: boolean;
};

const InfoRow = React.memo(({ label, value, hint, onPress, trailing }: {
    label: string;
    value: string;
    hint?: string;
    onPress?: () => void;
    trailing?: React.ReactNode;
}) => {
    const { theme } = useUnistyles();
    const body = (
        <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.colors.textSecondary }]}>{label}</Text>
            <View style={styles.rowValueWrap}>
                <Text style={[styles.rowValue, { color: theme.colors.text }]} numberOfLines={1}>{value}</Text>
                {hint ? <Text style={[styles.rowHint, { color: theme.colors.textSecondary }]} numberOfLines={1}>{hint}</Text> : null}
            </View>
            {trailing}
        </View>
    );
    if (onPress) {
        return <Pressable onPress={onPress} hitSlop={6}>{body}</Pressable>;
    }
    return body;
});

export const SessionDetailModal = React.memo(React.forwardRef<BottomSheetModal, Props>(({ session, machineName, loading }, ref) => {
    const { theme } = useUnistyles();
    const [copied, setCopied] = React.useState(false);

    const renderBackdrop = React.useCallback(
        (props: any) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />,
        [],
    );

    const handleDismiss = React.useCallback(() => setCopied(false), []);

    const handleCopyKey = React.useCallback(async () => {
        if (!session?.key) return;
        await Clipboard.setStringAsync(session.key);
        setCopied(true);
    }, [session?.key]);

    const title = session?.displayName || session?.label || session?.key || t('openclaw.sessions');

    // Token breakdown shown as a muted sub-line under the total.
    const tokenHint = session && (session.inputTokens != null || session.outputTokens != null)
        ? `↑ ${(session.inputTokens ?? 0).toLocaleString()}   ↓ ${(session.outputTokens ?? 0).toLocaleString()}`
        : undefined;

    return (
        <BottomSheetModal
            ref={ref}
            enableDynamicSizing
            backdropComponent={renderBackdrop}
            onDismiss={handleDismiss}
            backgroundStyle={{ backgroundColor: theme.colors.surface }}
            handleIndicatorStyle={{ backgroundColor: theme.colors.textSecondary }}
        >
            <BottomSheetView style={styles.container}>
                {loading && !session ? (
                    <View style={styles.loading}>
                        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
                    </View>
                ) : (
                    <>
                        <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>{title}</Text>

                        <InfoRow label={t('openclaw.infoType')} value={kindLabel(session?.kind)} />
                        {session?.model ? (
                            <InfoRow
                                label={t('openclaw.infoModel')}
                                value={session.model}
                                hint={session.modelProvider || undefined}
                            />
                        ) : null}
                        <InfoRow
                            label={t('openclaw.infoTokens')}
                            value={session?.totalTokens != null ? session.totalTokens.toLocaleString() : '—'}
                            hint={tokenHint}
                        />
                        {session?.contextTokens != null ? (
                            <InfoRow label={t('openclaw.infoContext')} value={session.contextTokens.toLocaleString()} />
                        ) : null}
                        <InfoRow label={t('openclaw.infoUpdated')} value={formatRelativeTime(session?.updatedAt ?? null)} />
                        {machineName ? (
                            <InfoRow label={t('openclaw.infoMachine')} value={machineName} />
                        ) : null}
                        {session?.key ? (
                            <InfoRow
                                label={t('openclaw.infoSessionKey')}
                                value={copied ? t('openclaw.infoCopied') : session.key}
                                onPress={handleCopyKey}
                                trailing={(
                                    <Ionicons
                                        name={copied ? 'checkmark' : 'copy-outline'}
                                        size={18}
                                        color={theme.colors.textSecondary}
                                        style={{ marginLeft: 8 }}
                                    />
                                )}
                            />
                        ) : null}
                    </>
                )}
            </BottomSheetView>
        </BottomSheetModal>
    );
}));

const styles = StyleSheet.create((theme, runtime) => ({
    container: {
        paddingHorizontal: theme.margins.lg,
        paddingTop: theme.margins.sm,
        paddingBottom: runtime.insets.bottom + theme.margins.lg,
    },
    loading: {
        alignItems: 'center',
        paddingVertical: 40,
    },
    title: {
        ...Typography.default('semiBold'),
        fontSize: 18,
        marginBottom: theme.margins.sm,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        gap: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: theme.colors.divider,
    },
    rowLabel: {
        ...Typography.default(),
        fontSize: 14,
        flexShrink: 0,
    },
    rowValueWrap: {
        flex: 1,
        alignItems: 'flex-end',
    },
    rowValue: {
        ...Typography.default('semiBold'),
        fontSize: 15,
    },
    rowHint: {
        ...Typography.default(),
        fontSize: 12,
        marginTop: 2,
    },
}));
