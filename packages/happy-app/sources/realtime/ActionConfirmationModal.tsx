// packages/happy-app/sources/realtime/ActionConfirmationModal.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';
import { Modal } from '@/modal';
import { t } from '@/text';
import { getActionConfirmationSeconds } from '@/sync/voiceConfig';
import { ModalRegistry, type RegisteredVoiceModal } from './voiceModalRegistry';

export type ActionConfirmationResult = 'confirmed' | 'cancelled';

interface ActionConfirmationModalProps {
    title: string;
    body: string;
    confirmLabel: string;
    cancelLabel: string;
    countdownSeconds: number;
    onResult: (result: ActionConfirmationResult) => void;
}

function ActionConfirmationModalContent({
    title, body, confirmLabel, cancelLabel, countdownSeconds, onResult,
}: ActionConfirmationModalProps) {
    const { theme } = useUnistyles();
    const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);
    const progressAnim = useRef(new Animated.Value(1)).current;
    const doneRef = useRef(false);

    const finish = useCallback((result: ActionConfirmationResult) => {
        if (doneRef.current) return;
        doneRef.current = true;
        onResult(result);
    }, [onResult]);

    useEffect(() => {
        if (secondsLeft <= 0) finish('confirmed');
    }, [secondsLeft, finish]);

    useEffect(() => {
        Animated.timing(progressAnim, {
            toValue: 0,
            duration: countdownSeconds * 1000,
            useNativeDriver: false,
        }).start();
        const interval = setInterval(() => {
            setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
            <View style={[styles.messageBox, { backgroundColor: theme.colors.surfaceHigh }]}>
                <Text style={[styles.messageText, { color: theme.colors.text }]} numberOfLines={6}>
                    {body}
                </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.colors.divider }]}>
                <Animated.View
                    style={[
                        styles.progressBar,
                        {
                            backgroundColor: theme.colors.textLink,
                            width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                        },
                    ]}
                />
            </View>
            <Text style={[styles.countdown, { color: theme.colors.textSecondary }]}>
                {t('voiceActionConfirmation.countdown', { seconds: secondsLeft })}
            </Text>
            <View style={styles.buttons}>
                <Pressable
                    style={({ pressed }) => [
                        styles.button,
                        { backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceHigh },
                    ]}
                    onPress={() => finish('cancelled')}
                >
                    <Text style={[styles.buttonText, { color: theme.colors.textDestructive }]}>
                        {cancelLabel}
                    </Text>
                </Pressable>
                <Pressable
                    style={({ pressed }) => [
                        styles.button,
                        styles.buttonPrimary,
                        { backgroundColor: theme.colors.button.primary.background, opacity: pressed ? 0.8 : 1 },
                    ]}
                    onPress={() => finish('confirmed')}
                >
                    <Text style={[styles.buttonText, { color: theme.colors.button.primary.tint }]}>
                        {confirmLabel}
                    </Text>
                </Pressable>
            </View>
        </View>
    );
}

function showActionConfirmation(opts: {
    title: string;
    body: string;
    confirmLabel: string;
}): Promise<ActionConfirmationResult> {
    const countdownSeconds = getActionConfirmationSeconds();
    return new Promise((resolve) => {
        let resolved = false;
        let modalId: string | null = null;
        let safetyTimer: ReturnType<typeof setTimeout> | null = null;

        const finalize = (result: ActionConfirmationResult) => {
            if (resolved) return;
            resolved = true;
            if (safetyTimer !== null) clearTimeout(safetyTimer);
            ModalRegistry.unregister(handle);
            if (modalId !== null) Modal.hide(modalId);
            resolve(result);
        };

        const handle: RegisteredVoiceModal = {
            kind: 'countdown',
            dismiss: () => finalize('cancelled'),
        };

        modalId = Modal.show({
            component: ActionConfirmationModalContent,
            props: {
                title: opts.title,
                body: opts.body,
                confirmLabel: opts.confirmLabel,
                cancelLabel: t('voiceActionConfirmation.cancel'),
                countdownSeconds,
                onResult: finalize,
            },
        });

        ModalRegistry.register(handle);

        // Fallback: never leave a pending promise behind.
        safetyTimer = setTimeout(() => finalize('cancelled'), (countdownSeconds + 2) * 1000);
    });
}

export function showSendConfirmation(message: string): Promise<'sent' | 'cancelled'> {
    return showActionConfirmation({
        title: t('voiceActionConfirmation.sendTitle'),
        body: message,
        confirmLabel: t('voiceActionConfirmation.sendConfirm'),
    }).then((r) => (r === 'confirmed' ? 'sent' : 'cancelled'));
}

export function showCreateConfirmation(directory: string, machineName: string): Promise<ActionConfirmationResult> {
    return showActionConfirmation({
        title: t('voiceActionConfirmation.createTitle'),
        body: `${directory}\n(${machineName})`,
        confirmLabel: t('voiceActionConfirmation.createConfirm'),
    });
}

export function showDeleteConfirmation(sessionName: string): Promise<ActionConfirmationResult> {
    return showActionConfirmation({
        title: t('voiceActionConfirmation.deleteTitle'),
        body: sessionName,
        confirmLabel: t('voiceActionConfirmation.deleteConfirm'),
    });
}

const styles = StyleSheet.create((theme) => ({
    container: {
        width: 320,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: theme.colors.modal.border,
    },
    title: { fontSize: 17, textAlign: 'center', marginBottom: 16, ...Typography.default('semiBold') },
    messageBox: { borderRadius: 10, padding: 12, marginBottom: 16 },
    messageText: { fontSize: 15, lineHeight: 21, ...Typography.default() },
    progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 8 },
    progressBar: { height: '100%', borderRadius: 2 },
    countdown: { fontSize: 13, textAlign: 'center', marginBottom: 16, ...Typography.default() },
    buttons: { flexDirection: 'row', gap: 10 },
    button: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
    buttonPrimary: {},
    buttonText: { fontSize: 15, ...Typography.default('semiBold') },
}));
