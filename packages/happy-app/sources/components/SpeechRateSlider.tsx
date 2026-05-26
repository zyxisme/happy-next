import * as React from 'react';
import RNSlider from '@react-native-community/slider';

export interface SpeechRateSliderProps {
    value: number;
    onValueChange: (value: number) => void;
    onSlidingComplete: (value: number) => void;
    minimumValue: number;
    maximumValue: number;
    step: number;
    minimumTrackTintColor: string;
    maximumTrackTintColor: string;
    thumbTintColor: string;
}

// Native: @react-native-community/slider. (Its default-export class typing breaks
// under the current @types/react, so cast to a props-typed component.)
const Slider = RNSlider as unknown as React.ComponentType<SpeechRateSliderProps>;

export function SpeechRateSlider(props: SpeechRateSliderProps) {
    return <Slider {...props} />;
}
