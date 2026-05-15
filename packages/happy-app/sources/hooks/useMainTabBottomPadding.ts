import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function useMainTabBottomPadding() {
    const safeArea = useSafeAreaInsets();
    return safeArea.bottom + 128;
}
