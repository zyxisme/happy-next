import * as React from 'react';
import { Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';

export const ChatHeaderTitle = React.memo((props: { title: string; subtitle?: string; width?: number }) => {
    const { theme } = useUnistyles();
    return (
        <View style={{ width: props.width, alignItems: 'center', justifyContent: 'center', flexShrink: props.width ? 0 : 1 }}>
            <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                    fontSize: 17,
                    color: theme.colors.header.tint,
                    width: '100%',
                    textAlign: 'center',
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
                        width: '100%',
                        textAlign: 'center',
                        ...Typography.default(),
                    }}
                >
                    {props.subtitle}
                </Text>
            ) : null}
        </View>
    );
});
