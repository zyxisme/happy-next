import * as React from 'react';

const NativeBottomTabs = (_props: Record<string, unknown>) => {
    if (__DEV__) {
        console.warn('NativeBottomTabs is not available on web. Use the web TabBar fallback instead.');
    }
    return null;
};

export default NativeBottomTabs;
