import * as React from 'react';
import type { SpeechRateSliderProps } from './SpeechRateSlider';

// Web: @react-native-community/slider's web build triggers an invalid-hook-call,
// so render a native range input (react-dom handles it directly inside the RN-web tree).
export function SpeechRateSlider({
    value,
    onValueChange,
    onSlidingComplete,
    minimumValue,
    maximumValue,
    step,
    minimumTrackTintColor,
}: SpeechRateSliderProps) {
    return (
        <input
            type="range"
            min={minimumValue}
            max={maximumValue}
            step={step}
            value={value}
            onChange={(e) => onValueChange(Number(e.target.value))}
            onPointerUp={(e) => onSlidingComplete(Number((e.currentTarget as HTMLInputElement).value))}
            onKeyUp={(e) => onSlidingComplete(Number((e.currentTarget as HTMLInputElement).value))}
            style={{ width: '100%', accentColor: minimumTrackTintColor, cursor: 'pointer' }}
        />
    );
}
