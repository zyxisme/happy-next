import * as React from 'react';
import { Text, View } from 'react-native';
import { useUnistyles } from 'react-native-unistyles';
import { Typography } from '@/constants/Typography';

export const ChatHeaderTitle = React.memo((props: { title: string; subtitle?: string; width?: number; align?: 'left' | 'center' }) => {
    const { theme } = useUnistyles();
    const isLeft = (props.align ?? 'center') === 'left';
    const hasFixedWidth = props.width !== undefined;
    const textAlignStyle = isLeft
        ? { width: '100%' as const, textAlign: 'left' as const }
        : (hasFixedWidth ? { width: '100%' as const, textAlign: 'center' as const } : null);
    return (
        <View style={{
            width: props.width,
            alignItems: isLeft ? 'flex-start' : 'center',
            justifyContent: 'center',
            flexGrow: isLeft && !hasFixedWidth ? 1 : 0,
            flexShrink: isLeft || !hasFixedWidth ? 1 : 0,
            minWidth: 0,
        }}>
            <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={{
                    fontSize: 17,
                    color: theme.colors.header.tint,
                    ...textAlignStyle,
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
                        ...textAlignStyle,
                        ...Typography.default(),
                    }}
                >
                    {props.subtitle}
                </Text>
            ) : null}
        </View>
    );
});
