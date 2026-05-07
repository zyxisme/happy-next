import React from 'react';
import { View, Text, Pressable, Platform, useWindowDimensions } from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { retrieveTempText } from '@/sync/persistence';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';
import * as Clipboard from 'expo-clipboard';
import { Modal } from '@/modal';
import { hapticsLight } from '@/components/haptics';
import { showCopiedToast } from '@/components/Toast';
import { Ionicons } from '@expo/vector-icons';
import { highlightMarkdownToHtml } from '@/utils/highlightMarkdownToHtml';
import { MONO_FONT_STACK } from '@/components/codeEditorShared';

const HEADER_BUTTON_WIDTH = 40;
const HEADER_BUTTONS_COUNT = 2;
const HEADER_PADDING = Platform.OS === 'ios' ? 16 : 32;
const HEADER_CENTER_PADDING = 24;

interface TokenRule {
    selector: string;
    color?: { light: string; dark: string };
    extra?: string;
}

const TOKEN_RULES: TokenRule[] = [
    { selector: '.tok-keyword, .tok-macroName, .tok-labelName', color: { light: '#af00db', dark: '#c586c0' } },
    { selector: '.tok-comment', color: { light: '#008000', dark: '#6a9955' }, extra: 'font-style: italic;' },
    { selector: '.tok-string, .tok-string2, .tok-attributeValue', color: { light: '#a31515', dark: '#ce9178' } },
    { selector: '.tok-number', color: { light: '#098658', dark: '#b5cea8' } },
    { selector: '.tok-bool, .tok-atom, .tok-literal', color: { light: '#0000ff', dark: '#569cd6' } },
    { selector: '.tok-meta, .tok-namespace, .tok-variableName, .tok-propertyName, .tok-attributeName', color: { light: '#001080', dark: '#9cdcfe' } },
    { selector: '.tok-operator, .tok-punctuation', color: { light: '#1f2328', dark: '#d4d4d4' } },
    { selector: '.tok-link, .tok-url', color: { light: '#0366d6', dark: '#569cd6' }, extra: 'text-decoration: underline;' },
    { selector: '.tok-heading', color: { light: '#800000', dark: '#4ec9b0' }, extra: 'font-weight: bold;' },
    { selector: '.tok-typeName, .tok-className', color: { light: '#267f99', dark: '#4ec9b0' } },
    { selector: '.tok-inserted', color: { light: '#098658', dark: '#4ec9b0' } },
    { selector: '.tok-deleted', color: { light: '#b31d28', dark: '#f48771' } },
    { selector: '.tok-invalid', color: { light: '#b31d28', dark: '#f48771' }, extra: 'text-decoration: underline;' },
    { selector: '.tok-tagName', color: { light: '#800000', dark: '#569cd6' } },
    { selector: '.tok-emphasis', extra: 'font-style: italic;' },
    { selector: '.tok-strong', extra: 'font-weight: bold;' },
    { selector: '.tok-monospace', extra: `font-family: ${MONO_FONT_STACK};` },
];

function highlightCss(isDark: boolean): string {
    return TOKEN_RULES.map(r => {
        const decls: string[] = [];
        if (r.color) decls.push(`color: ${isDark ? r.color.dark : r.color.light};`);
        if (r.extra) decls.push(r.extra);
        return `${r.selector} { ${decls.join(' ')} }`;
    }).join('\n');
}

function buildSelectionHtml(args: {
    highlightedHtml: string;
    isDark: boolean;
    backgroundColor: string;
    textColor: string;
    bottomPadding: number;
}): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
<style>
  html, body {
    margin: 0;
    padding: 0;
    background: ${args.backgroundColor};
    color: ${args.textColor};
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }
  body {
    padding: 16px 16px ${args.bottomPadding}px 16px;
    box-sizing: border-box;
    overflow-x: hidden;
  }
  #content {
    font-family: ${MONO_FONT_STACK};
    font-size: 14px;
    line-height: 20px;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    -webkit-user-select: text;
    user-select: text;
    -webkit-touch-callout: default;
    cursor: text;
  }
  ${highlightCss(args.isDark)}
</style>
</head>
<body>
<div id="content">${args.highlightedHtml}</div>
</body>
</html>`;
}

export default function TextSelectionScreen() {
    const router = useRouter();
    const { textId } = useLocalSearchParams<{ textId: string }>();
    const { theme, rt } = useUnistyles();
    const insets = useSafeAreaInsets();
    const [fullText, setFullText] = React.useState<string>('');
    const [loading, setLoading] = React.useState(true);
    const { width: screenWidth } = useWindowDimensions();
    const isDark = rt.themeName === 'dark';
    const bottomPadding = insets.bottom + 16;

    const html = React.useMemo(() => {
        const highlighted = fullText ? highlightMarkdownToHtml(fullText) : '';
        return buildSelectionHtml({
            highlightedHtml: highlighted,
            isDark,
            backgroundColor: theme.colors.surface,
            textColor: theme.colors.text,
            bottomPadding,
        });
    }, [fullText, isDark, theme.colors.surface, theme.colors.text, bottomPadding]);

    const headerTitleMaxWidth = screenWidth - (HEADER_BUTTON_WIDTH * HEADER_BUTTONS_COUNT) - HEADER_PADDING - HEADER_CENTER_PADDING;

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
            <WebView
                originWhitelist={['*']}
                source={{ html }}
                javaScriptEnabled
                domStorageEnabled
                setSupportMultipleWindows={false}
                mixedContentMode="always"
                {...(Platform.OS === 'ios' ? {
                    contentInsetAdjustmentBehavior: 'never' as const,
                    automaticallyAdjustContentInsets: false,
                    decelerationRate: 'normal' as const,
                    directionalLockEnabled: true,
                } : {})}
                style={{ flex: 1, backgroundColor: 'transparent' }}
            />
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
}));
