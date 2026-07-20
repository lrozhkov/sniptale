export type EffectMode = 'border' | 'blur' | 'focus';

export interface BorderPadding {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface BorderPreset {
  id: string;
  name: string;
  isSystemDefault?: boolean;
  enabled?: boolean;
  order: number;
  width: number;
  color: string;
  style: 'solid' | 'dashed' | 'dotted';
  radius: number;
  padding: BorderPadding;
  shadow: number;
  opacity: number;
  strokeOpacity: number;
  fillColor: string;
  fillOpacity: number;
  inheritCustomCss: boolean;
  customCss: string;
}

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
