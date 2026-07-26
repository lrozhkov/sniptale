export const SYSTEM_BORDER_PRESET_KEYS = [
  'system-default',
  'system-soft-highlight',
  'system-marker',
  'system-success',
  'system-attention',
  'system-review',
  'system-light-ui',
  'system-dark-ui',
] as const;

export type SystemBorderPresetKey = (typeof SYSTEM_BORDER_PRESET_KEYS)[number];
export type BorderPresetOrigin = 'system' | 'user';

export interface BorderPadding {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

export interface BorderPreset {
  id: string;
  name: string;
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
  origin?: BorderPresetOrigin;
  systemPresetKey?: SystemBorderPresetKey;
  basedOnRevision?: number;
  customized?: boolean;
}

export function isSystemBorderPresetKey(value: unknown): value is SystemBorderPresetKey {
  return (
    typeof value === 'string' && (SYSTEM_BORDER_PRESET_KEYS as readonly string[]).includes(value)
  );
}
