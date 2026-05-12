import * as React from 'react';
import { Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';

export const ChatHeaderTitle = React.memo((props: { title: string; subtitle?: string; width?: number }) => {
    const { theme } = useUnistyles();
    const hasFixedWidth = props.width !== undefined;
    return (
        <View style={{ width: props.width, alignItems: 'center', justifyContent: 'center', flexShrink: hasFixedWidth ? 0 : 1 }}>
            <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                    fontSize: 17,
                    color: theme.colors.header.tint,
                    ...(hasFixedWidth ? { width: '100%', textAlign: 'center' as const } : null),
                    ...Typography.default('semiBold'),
                }}
            >
                {props.title}
            </Text>
            {props.subtitle ? (
                <Text
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{
                        fontSize: 12,
                        lineHeight: 14,
                        opacity: 0.7,
                        color: theme.colors.header.tint,
                        ...(hasFixedWidth ? { width: '100%', textAlign: 'center' as const } : null),
                        ...Typography.default(),
                    }}
                >
                    {props.subtitle}
                </Text>
            ) : null}
        </View>
    );
});
