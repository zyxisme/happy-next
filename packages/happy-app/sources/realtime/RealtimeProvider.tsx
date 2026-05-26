import React, { useEffect } from 'react';
import { HappyVoiceSession } from './HappyVoiceSession';
import { registerVoiceToolRpcHandlers } from './registerVoiceToolRpcHandlers';

export const RealtimeProvider = ({ children }: { children: React.ReactNode }) => {
    useEffect(() => {
        return registerVoiceToolRpcHandlers();
    }, []);

    return (
        <>
            <HappyVoiceSession />
            {children}
        </>
    );
};
