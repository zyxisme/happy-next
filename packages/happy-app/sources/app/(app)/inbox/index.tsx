import * as React from 'react';
import { Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useUnistyles } from 'react-native-unistyles';
import { InboxView } from "@/components/InboxView";
import { trackFriendsSearch } from '@/track';

export default function InboxPage() {
    const router = useRouter();
    const { theme } = useUnistyles();
    return (
        <>
            <Stack.Screen
                options={{
                    headerRight: () => (
                        <Pressable
                            onPress={() => {
                                trackFriendsSearch();
                                router.push('/friends/search');
                            }}
                            hitSlop={15}
                        >
                            <Ionicons name="person-add-outline" size={24} color={theme.colors.header.tint} />
                        </Pressable>
                    ),
                }}
            />
            <InboxView />
        </>
    );
}
