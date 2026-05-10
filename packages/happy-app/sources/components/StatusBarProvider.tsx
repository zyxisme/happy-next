import React from 'react';
import { StatusBarControllerProvider } from './StatusBarController';

export const StatusBarProvider = React.memo(({ children }: { children?: React.ReactNode }) => {
    return (
        <StatusBarControllerProvider>
            {children}
        </StatusBarControllerProvider>
    );
});
