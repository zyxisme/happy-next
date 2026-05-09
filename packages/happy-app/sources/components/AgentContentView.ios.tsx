import { useHeaderHeight } from '@/utils/responsive';
import * as React from 'react';
import { View } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface AgentContentViewProps {
    input?: React.ReactNode | null;
    content?: React.ReactNode | null;
    placeholder?: React.ReactNode | null;
    betweenContentAndInput?: React.ReactNode | null;
}

export const AgentContentView: React.FC<AgentContentViewProps> = React.memo(({ input, content, placeholder, betweenContentAndInput }) => {
    const safeArea = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();
    return (
        <View style={{ flexBasis:0, flexGrow:1 }}>
            <View style={{ flexBasis:0, flexGrow:1 }}>
                {content && (
                    <KeyboardStickyView
                        offset={{ opened: safeArea.bottom }}
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                    >
                        {content}
                    </KeyboardStickyView>
                )}
                {placeholder && (
                    <Animated.ScrollView 
                        style={{ position: 'absolute', top: safeArea.top + headerHeight, left: 0, right: 0, bottom: 0 }}
                        contentContainerStyle={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}
                        keyboardShouldPersistTaps="handled"
                        alwaysBounceVertical={false}
                    >
                        {placeholder}
                    </Animated.ScrollView>
                )}
            </View>
            <KeyboardStickyView offset={{ opened: safeArea.bottom }}>
                {betweenContentAndInput}
                {input}
            </KeyboardStickyView>
        </View>
    );
});

// const FallbackKeyboardAvoidingView: React.FC<AgentContentViewProps> = React.memo(({
//     children,
// }) => {
    
// });
