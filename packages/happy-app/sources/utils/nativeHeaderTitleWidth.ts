import { Platform } from 'react-native';
import { isRunningOnMac } from '@/utils/platform';

// Reference: iPhone 14/15 Pro Max width (430pt). `base` is the title width at that screen size
// for the given right-action count (1 ≈ back + 1 button, 2 ≈ back + 2 buttons). `min`/`max` clamp
// the scaled value for small phones and tablets. Returns undefined on Web/Mac so the platform's
// native header layout handles sizing. Web still uses this for our custom header,
// but with the effective centered content width clamped by the caller.
const BASE_SCREEN_WIDTH = 430;

const WIDTH_BY_ACTION_COUNT = {
    0: { base: 300, min: 220, max: 520 },
    1: { base: 256, min: 200, max: 420 },
    2: { base: 192, min: 150, max: 360 },
} as const;

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function normalizeActionCount(count: number): 0 | 1 | 2 {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    return 2;
}

export function getNativeHeaderTitleWidth(options: {
    screenWidth: number;
    rightActionCount?: number;
    leftActionCount?: number;
}): number | undefined {
    if (isRunningOnMac()) {
        return undefined;
    }

    const actionCount = normalizeActionCount(Math.max(
        options.leftActionCount ?? 1,
        options.rightActionCount ?? 0,
    ));
    const config = WIDTH_BY_ACTION_COUNT[actionCount];
    const scaledWidth = Math.round((options.screenWidth / BASE_SCREEN_WIDTH) * config.base);
    return clamp(scaledWidth, config.min, config.max);
}
