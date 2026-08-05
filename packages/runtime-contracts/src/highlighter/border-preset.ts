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

export interface BorderVisualStyle {
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

export interface BorderPreset extends BorderVisualStyle {
  id: string;
  name: string;
  enabled?: boolean;
  order: number;
  origin?: BorderPresetOrigin;
  systemPresetKey?: SystemBorderPresetKey;
  basedOnRevision?: number;
  customized?: boolean;
}

/** A frame-owned visual snapshot. Catalog metadata never becomes runtime state authority. */
export interface AppliedBorderSettings extends BorderVisualStyle {
  sourcePresetId?: string;
  sourcePresetName?: string;
}

export type BorderVisualStylePatch = Omit<Partial<BorderVisualStyle>, 'padding'> & {
  padding?: Partial<BorderPadding>;
};

export function cloneBorderVisualStyle(style: BorderVisualStyle): BorderVisualStyle {
  return {
    width: style.width,
    color: style.color,
    style: style.style,
    radius: style.radius,
    padding: { ...style.padding },
    shadow: style.shadow,
    opacity: style.opacity,
    strokeOpacity: style.strokeOpacity,
    fillColor: style.fillColor,
    fillOpacity: style.fillOpacity,
    inheritCustomCss: style.inheritCustomCss,
    customCss: style.customCss,
  };
}

export function projectBorderPresetToAppliedSettings(preset: BorderPreset): AppliedBorderSettings {
  return {
    ...cloneBorderVisualStyle(preset),
    sourcePresetId: preset.id,
    sourcePresetName: preset.name,
  };
}

export function cloneAppliedBorderSettings(settings: AppliedBorderSettings): AppliedBorderSettings {
  return { ...settings, padding: { ...settings.padding } };
}

export function applyManualBorderStylePatch(
  settings: AppliedBorderSettings,
  patch: BorderVisualStylePatch
): AppliedBorderSettings {
  const {
    sourcePresetId: _sourcePresetId,
    sourcePresetName: _sourcePresetName,
    ...visual
  } = settings;
  return {
    ...visual,
    ...patch,
    padding: { ...settings.padding, ...patch.padding },
  };
}

/** Normalizes the legacy frame snapshot shape that stored a complete preset per frame. */
export function normalizeAppliedBorderSettings(
  settings: AppliedBorderSettings | BorderPreset
): AppliedBorderSettings {
  if ('id' in settings && 'name' in settings) {
    return projectBorderPresetToAppliedSettings(settings);
  }
  return cloneAppliedBorderSettings(settings);
}

export function isSystemBorderPresetKey(value: unknown): value is SystemBorderPresetKey {
  return (
    typeof value === 'string' && (SYSTEM_BORDER_PRESET_KEYS as readonly string[]).includes(value)
  );
}
