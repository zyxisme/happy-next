import * as React from 'react';
import { View, Pressable } from 'react-native';
import { DooTaskListView } from '@/components/DooTaskListView';
import { DooTaskCreateSheet } from '@/components/dootask/DooTaskCreateSheet';
import { useUnistyles } from 'react-native-unistyles';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function DooTaskPage() {
    const { theme } = useUnistyles();
    const router = useRouter();

    const [createMenuVisible, setCreateMenuVisible] = React.useState(false);

    const handleCreatePress = React.useCallback(() => {
        setCreateMenuVisible(true);
    }, []);

    const handleCreateMenuClose = React.useCallback(() => {
        setCreateMenuVisible(false);
    }, []);

    const handleSelectTask = React.useCallback(() => {
        router.push('/dootask/add-task');
    }, [router]);

    const handleSelectProject = React.useCallback(() => {
        router.push('/dootask/add-project');
    }, [router]);

    return (
        <View style={{ flex: 1 }}>
            <Stack.Screen
                options={{
                    headerRight: () => (
                        <Pressable
                            onPress={handleCreatePress}
                            hitSlop={15}
                        >
                            <Ionicons
                                name="add-outline"
                                size={24}
                                color={theme.colors.header.tint}
                            />
                        </Pressable>
                    ),
                }}
            />
            <DooTaskListView />
            <DooTaskCreateSheet
                visible={createMenuVisible}
                onClose={handleCreateMenuClose}
                onSelectTask={handleSelectTask}
                onSelectProject={handleSelectProject}
            />
        </View>
    );
}
