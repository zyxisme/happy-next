import { Appearance } from 'react-native';

export const setAppColorScheme = (scheme: 'light' | 'dark' | null) => {
    // Appearance.setColorScheme exists on native React Native, but not on the
    // web implementation used by react-native-web.
    const setColorScheme = (Appearance as typeof Appearance & {
        setColorScheme?: (scheme: 'light' | 'dark' | null) => void;
    }).setColorScheme;
    setColorScheme?.(scheme);
};
