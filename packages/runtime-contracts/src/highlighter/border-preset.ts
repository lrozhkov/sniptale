import type { AnnotationTemplateTagId } from './annotation-template-tags';

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
export type BorderPresetBlurType = 'gaussian' | 'distortion' | 'pixelate' | 'solid';
export type AnnotationTemplateSource = 'frame-default' | 'forced';

export interface BorderPresetEffects {
  blur: {
    amount: number;
    blurType: BorderPresetBlurType;
  };
  focus: {
    blurAmount: number;
    opacity: number;
  };
  capture: {
    hideFrame: boolean;
  };
  linkedTemplates?: {
    calloutPresetId: string | null;
    stepBadgePresetId: string | null;
  };
}

export const DEFAULT_BORDER_PRESET_EFFECTS: BorderPresetEffects = {
  blur: { amount: 10, blurType: 'gaussian' },
  focus: { blurAmount: 0, opacity: 0.5 },
  capture: { hideFrame: false },
  linkedTemplates: { calloutPresetId: null, stepBadgePresetId: null },
};

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
  fillPaint: Paint;
  inheritCustomCss: boolean;
  customCss: string;
  effects?: BorderPresetEffects;
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
  tagIds: AnnotationTemplateTagId[];
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
    fillPaint: clonePaint(style.fillPaint),
    inheritCustomCss: style.inheritCustomCss,
    customCss: style.customCss,
    effects: cloneBorderPresetEffects(style.effects),
  };
}

export function cloneBorderPresetEffects(
  effects: BorderPresetEffects | undefined
): BorderPresetEffects {
  const source = effects ?? DEFAULT_BORDER_PRESET_EFFECTS;
  return {
    blur: { ...source.blur },
    focus: { blurAmount: source.focus.blurAmount ?? 0, opacity: source.focus.opacity },
    capture: { hideFrame: source.capture?.hideFrame ?? false },
    linkedTemplates: {
      calloutPresetId: source.linkedTemplates?.calloutPresetId ?? null,
      stepBadgePresetId: source.linkedTemplates?.stepBadgePresetId ?? null,
    },
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
  return {
    ...settings,
    fillPaint: clonePaint(settings.fillPaint),
    padding: { ...settings.padding },
    effects: cloneBorderPresetEffects(settings.effects),
  };
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
    fillPaint: clonePaint(patch.fillPaint ?? settings.fillPaint),
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
import { clonePaint, type Paint } from '@sniptale/foundation/paint';
