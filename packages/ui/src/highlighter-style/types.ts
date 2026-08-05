export type EffectMode = 'border' | 'blur' | 'focus';

export type {
  AppliedBorderSettings,
  BorderPadding,
  BorderPreset,
  BorderPresetOrigin,
  BorderVisualStyle,
  BorderVisualStylePatch,
  SystemBorderPresetKey,
} from '@sniptale/runtime-contracts/highlighter/border-preset';
import type { BorderPreset } from '@sniptale/runtime-contracts/highlighter/border-preset';

export type BlurType = 'gaussian' | 'distortion' | 'pixelate' | 'solid';
export type BlurStrokeStyle = BorderPreset['style'] | 'dash' | 'dot' | 'dash-dot' | 'long-dash';

export interface BlurSettings {
  amount: number;
  blurType: BlurType;
  borderPresetId?: string | null;
  radius?: number;
  shadow?: BorderPreset['shadow'];
  showBorder?: boolean;
  strokeColor?: string;
  strokeOpacity?: number;
  strokeStyle?: BlurStrokeStyle;
  strokeWidth?: number;
}

export interface FocusSettings {
  opacity: number;
  showBorder?: boolean;
}
