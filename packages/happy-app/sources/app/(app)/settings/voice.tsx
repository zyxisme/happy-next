import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { Item } from '@/components/Item';
import { ItemGroup } from '@/components/ItemGroup';
import { ItemList } from '@/components/ItemList';
import { useSettingMutable } from '@/sync/storage';
import { findLanguageByCode, getLanguageDisplayName, LANGUAGES } from '@/constants/Languages';
import { t } from '@/text';
import { Switch } from '@/components/Switch';
import {
    getHappyVoiceGatewayUrl,
    hasCustomHappyVoiceGatewayUrl,
    getHappyVoicePublicKey,
    hasCustomHappyVoicePublicKey,
    getSendConfirmation,
    setSendConfirmation,
    getSendConfirmationSpeed,
    setSendConfirmationSpeed,
    getWelcomeMessage,
    hasCustomWelcomeMessage,
    type SendConfirmationSpeed,
} from '@/sync/voiceConfig';

function truncate(s: string, maxLen: number): string {
    return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

export default function VoiceSettingsScreen() {
    const router = useRouter();
    const [voiceAssistantLanguage] = useSettingMutable('voiceAssistantLanguage');
    const currentLanguage = findLanguageByCode(voiceAssistantLanguage) || LANGUAGES[0];

    // Local state that refreshes when returning from sub-pages
    const [gatewayUrl, setGatewayUrl] = useState(() => getHappyVoiceGatewayUrl());
    const [publicKey, setPublicKey] = useState(() => getHappyVoicePublicKey());
    const [sendConfirmationEnabled, setSendConfirmationEnabled] = useState(() => getSendConfirmation());
    const [confirmationSpeed, setConfirmationSpeed] = useState<SendConfirmationSpeed>(() => getSendConfirmationSpeed());
    const [welcomeMessage, setWelcomeMessageState] = useState(() => getWelcomeMessage());

    useFocusEffect(
        useCallback(() => {
            setGatewayUrl(getHappyVoiceGatewayUrl());
            setPublicKey(getHappyVoicePublicKey());
            setSendConfirmationEnabled(getSendConfirmation());
            setConfirmationSpeed(getSendConfirmationSpeed());
            setWelcomeMessageState(getWelcomeMessage());
        }, []),
    );

    const handleSendConfirmationChange = (value: boolean) => {
        setSendConfirmation(value);
        setSendConfirmationEnabled(value);
    };

    const handleSpeedChange = (value: SendConfirmationSpeed) => {
        setSendConfirmationSpeed(value);
        setConfirmationSpeed(value);
    };

    return (
        <ItemList style={{ paddingTop: 0 }}>
            {/* Happy Voice Configuration */}
            <ItemGroup
                title={t('settingsVoice.happyVoiceTitle')}
                footer={t('settingsVoice.happyVoiceDescription')}
            >
                <Item
                    title={t('settingsVoice.gatewayUrl')}
                    icon={<Ionicons name="link-outline" size={29} color="#5856D6" />}
                    detail={gatewayUrl ? truncate(gatewayUrl, 25) : t('settingsVoice.notConfigured')}
                    subtitle={hasCustomHappyVoiceGatewayUrl() ? t('settingsVoice.usingCustomConfig') : t('settingsVoice.usingDefaultConfig')}
                    onPress={() => router.push('/settings/voice/happy-voice')}
                />
                <Item
                    title={t('settingsVoice.publicKey')}
                    icon={<Ionicons name="shield-outline" size={29} color="#FF2D55" />}
                    detail={publicKey ? '********' : t('settingsVoice.notConfigured')}
                    subtitle={hasCustomHappyVoicePublicKey() ? t('settingsVoice.usingCustomConfig') : t('settingsVoice.usingDefaultConfig')}
                    onPress={() => router.push('/settings/voice/happy-voice')}
                />
            </ItemGroup>

            {/* Welcome Message */}
            <ItemGroup
                title={t('settingsVoice.welcomeMessageTitle')}
                footer={t('settingsVoice.welcomeMessageDescription')}
            >
                <Item
                    title={t('settingsVoice.welcomeMessage')}
                    icon={<Ionicons name="chatbubble-ellipses-outline" size={29} color="#FF9500" />}
                    detail={welcomeMessage ? truncate(welcomeMessage, 30) : t('settingsVoice.usingDefaultConfig')}
                    subtitle={hasCustomWelcomeMessage() ? t('settingsVoice.usingCustomConfig') : t('settingsVoice.usingDefaultConfig')}
                    onPress={() => router.push('/settings/voice/welcome-message')}
                />
            </ItemGroup>

            {/* Language Settings */}
            <ItemGroup
                title={t('settingsVoice.languageTitle')}
                footer={t('settingsVoice.languageDescription')}
            >
                <Item
                    title={t('settingsVoice.preferredLanguage')}
                    subtitle={t('settingsVoice.preferredLanguageSubtitle')}
                    icon={<Ionicons name="language-outline" size={29} color="#007AFF" />}
                    detail={getLanguageDisplayName(currentLanguage)}
                    onPress={() => router.push('/settings/voice/language')}
                />
            </ItemGroup>

            {/* Send Confirmation */}
            <ItemGroup
                title={t('settingsVoice.sendConfirmationTitle')}
                footer={t('settingsVoice.sendConfirmationDescription')}
            >
                <Item
                    title={t('settingsVoice.sendConfirmationLabel')}
                    subtitle={t('settingsVoice.sendConfirmationSubtitle')}
                    icon={<Ionicons name="shield-checkmark-outline" size={29} color="#34C759" />}
                    rightElement={
                        <Switch
                            value={sendConfirmationEnabled}
                            onValueChange={handleSendConfirmationChange}
                        />
                    }
                    showChevron={false}
                />
            </ItemGroup>

            {/* Confirmation Speed */}
            {sendConfirmationEnabled && (
                <ItemGroup
                    title={t('settingsVoice.sendConfirmationSpeedTitle')}
                >
                    <Item
                        title={t('settingsVoice.speedFast')}
                        icon={<Ionicons name="flash-outline" size={29} color="#FF9500" />}
                        rightElement={
                            confirmationSpeed === 'fast'
                                ? <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
                                : null
                        }
                        onPress={() => handleSpeedChange('fast')}
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsVoice.speedNormal')}
                        icon={<Ionicons name="time-outline" size={29} color="#007AFF" />}
                        rightElement={
                            confirmationSpeed === 'normal'
                                ? <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
                                : null
                        }
                        onPress={() => handleSpeedChange('normal')}
                        showChevron={false}
                    />
                    <Item
                        title={t('settingsVoice.speedSlow')}
                        icon={<Ionicons name="hourglass-outline" size={29} color="#5856D6" />}
                        rightElement={
                            confirmationSpeed === 'slow'
                                ? <Ionicons name="checkmark-circle" size={24} color="#007AFF" />
                                : null
                        }
                        onPress={() => handleSpeedChange('slow')}
                        showChevron={false}
                    />
                </ItemGroup>
            )}
        </ItemList>
    );
}
