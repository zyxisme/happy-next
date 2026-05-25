import React, { useEffect, useRef } from 'react';
import { registerVoiceSession, getSessionVersion, setRealtimeStatusIfCurrent } from './RealtimeSession';
import type { VoiceSession, VoiceSessionConfig } from './types';

// NOTE: The Happy Voice gateway now uses Volcano Engine RTC (火山引擎), whose
// real-time client SDK is web-only in this iteration (@volcengine/rtc). The
// native client requires @volcengine/react-native-rtc + an Expo dev build and
// will land in a follow-up. Until then, native voice degrades gracefully.
class HappyVoiceSessionImpl implements VoiceSession {
    async startSession(_config: VoiceSessionConfig): Promise<void> {
        const version = getSessionVersion();
        console.warn('[HappyVoiceVolc] Voice is not yet supported on native (web-only for now).');
        setRealtimeStatusIfCurrent(version, 'error');
    }

    async endSession(): Promise<void> {
        // no-op
    }

    async setMicrophoneMuted(_muted: boolean): Promise<void> {
        // no-op
    }

    sendTextMessage(_message: string): void {
        // no-op
    }

    sendContextualUpdate(_update: string): void {
        // no-op
    }
}

export const HappyVoiceSession: React.FC = () => {
    const hasRegistered = useRef(false);

    useEffect(() => {
        if (!hasRegistered.current) {
            registerVoiceSession(new HappyVoiceSessionImpl());
            hasRegistered.current = true;
        }
    }, []);

    return null;
};
