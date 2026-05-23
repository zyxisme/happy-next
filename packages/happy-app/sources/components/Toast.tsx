import * as React from 'react';
import { Animated, Text, StyleSheet, Platform, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { t } from '@/text';

/** Leading icon name, or `null` for a plain info toast with no icon. */
type ToastIcon = keyof typeof Ionicons.glyphMap | null;

const DEFAULT_ICON: ToastIcon = 'checkmark-circle';

let _show: ((message?: string, icon?: ToastIcon) => void) | null = null;

/**
 * Show a brief toast. Defaults to a checkmark icon and "Copied" text.
 * Pass `{ icon: null }` for a plain info toast with no leading icon.
 */
export function showToast(message?: string, options?: { icon?: ToastIcon }) {
    _show?.(message, options?.icon === undefined ? DEFAULT_ICON : options.icon);
}

/** Shorthand: show the "Copied" toast. */
export function showCopiedToast() {
    _show?.();
}

/**
 * Mount this component once at the app root.
 * It renders an absolutely-positioned toast that auto-fades.
 */
const BASE_BOTTOM = Platform.OS === 'ios' ? 100 : 80;

export function ToastHost() {
    const opacity = React.useRef(new Animated.Value(0)).current;
    const timeout = React.useRef<ReturnType<typeof setTimeout>>(undefined);
    const [message, setMessage] = React.useState('');
    const [icon, setIcon] = React.useState<ToastIcon>(DEFAULT_ICON);
    const [bottomOffset, setBottomOffset] = React.useState(BASE_BOTTOM);

    React.useEffect(() => {
        if (Platform.OS !== 'ios') return;
        const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
            setBottomOffset(e.endCoordinates.height + 20);
        });
        const hideSub = Keyboard.addListener('keyboardWillHide', () => {
            setBottomOffset(BASE_BOTTOM);
        });
        return () => { showSub.remove(); hideSub.remove(); };
    }, []);

    const show = React.useCallback((msg?: string, nextIcon: ToastIcon = DEFAULT_ICON) => {
        if (timeout.current) clearTimeout(timeout.current);
        setMessage(msg ?? t('common.copied'));
        setIcon(nextIcon);
        opacity.setValue(1);
        timeout.current = setTimeout(() => {
            Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }).start();
        }, 1200);
    }, [opacity]);

    React.useEffect(() => {
        _show = show;
        return () => { _show = null; };
    }, [show]);

    return (
        <Animated.View pointerEvents="none" style={[toastStyles.container, { opacity, bottom: bottomOffset }]}>
            {icon ? <Ionicons name={icon} size={16} color="#fff" style={{ marginRight: 6 }} /> : null}
            <Text style={toastStyles.text}>{message}</Text>
        </Animated.View>
    );
}

const toastStyles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: BASE_BOTTOM,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.75)',
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 20,
        zIndex: 9999,
    },
    text: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
    },
});
