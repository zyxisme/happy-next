import React from 'react';
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { retrieveTempText } from '@/sync/persistence';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/modal';
import { hapticsLight } from '@/components/haptics';
import { showCopiedToast } from '@/components/Toast';
import { Ionicons } from '@expo/vector-icons';
import { CodeEditor } from '@/components/CodeEditor';

// Header button width constants
const HEADER_BUTTON_WIDTH = 40; // 24px icon + 16px padding
const HEADER_PADDING = Platform.OS === 'ios' ? 16 : 32;
const HEADER_CENTER_PADDING = 24;

export default function TextSelectionScreen() {
    const router = useRouter();
    const { textId } = useLocalSearchParams<{ textId: string }>();
    const { theme } = useUnistyles();
    const insets = useSafeAreaInsets();
    const [fullText, setFullText] = React.useState<string>('');
    const [loading, setLoading] = React.useState(true);
    const { width: screenWidth } = useWindowDimensions();

    // Left: back button (1), Right: copy button (1)
    const headerTitleMaxWidth = screenWidth - (HEADER_BUTTON_WIDTH * 2) - HEADER_PADDING - HEADER_CENTER_PADDING;

    // Copy functionality
    const handleCopyAll = React.useCallback(async () => {
        if (!fullText) {
            Modal.alert(t('common.error'), t('textSelection.noTextToCopy'));
            return;
        }

        try {
            await Clipboard.setStringAsync(fullText);
            hapticsLight(); showCopiedToast();
        } catch (error) {
            Modal.alert(t('common.error'), t('textSelection.failedToCopy'));
        }
    }, [fullText]);

    React.useEffect(() => {
        if (!textId) {
            Modal.alert(t('common.error'), t('textSelection.noTextProvided'), [
                { text: t('common.ok'), onPress: () => router.back() }
            ]);
            return;
        }

        const content = retrieveTempText(textId);
        if (content) {
            setFullText(content);
        } else {
            Modal.alert(t('common.error'), t('textSelection.textNotFound'), [
                { text: t('common.ok'), onPress: () => router.back() }
            ]);
        }
        setLoading(false);
    }, [textId, router]);

    if (loading) {
        return (
            <View style={styles.container}>
                <Text style={[styles.loadingText, { color: theme.colors.textSecondary }]}>
                    {t('common.loading')}
                </Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.surface }]}>
            <Stack.Screen
                options={{
                    headerTitle: () => (
                        <View style={{ alignItems: 'center', justifyContent: 'center', maxWidth: headerTitleMaxWidth }}>
                            <Text
                                numberOfLines={1}
                                ellipsizeMode="tail"
                                style={[Typography.default('semiBold'), { fontSize: 17, lineHeight: 24, color: theme.colors.header.tint }]}
                            >
                                {t('textSelection.title')}
                            </Text>
                        </View>
                    ),
                    headerRight: () => (
                        <Pressable
                            onPress={handleCopyAll}
                            style={({ pressed }) => [
                                { opacity: pressed ? 0.7 : 1 }
                            ]}
                            disabled={loading || !fullText}
                        >
                            <Ionicons
                                name="copy-outline"
                                size={20}
                                color={loading || !fullText ? theme.colors.textSecondary : theme.colors.header.tint}
                            />
                        </Pressable>
                    ),
                }}
            />
            <View style={styles.editorContainer}>
                <CodeEditor
                    value={fullText}
                    language="markdown"
                    readOnly={true}
                    lineWrapping={true}
                    bottomPadding={insets.bottom + 16}
                    onChangeText={() => {}}
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create((theme) => ({
    container: {
        flex: 1,
        backgroundColor: theme.colors.surface,
    },
    loadingText: {
        ...Typography.default(),
        fontSize: 16,
        textAlign: 'center',
        marginTop: 50,
    },
    editorContainer: {
        flex: 1,
    },
}));
