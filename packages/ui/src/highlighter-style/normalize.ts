import type { BorderPreset } from './types';

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

const LEGACY_BORDER_SHADOW_INTENSITIES = {
  none: 0,
  soft: 30,
  hard: 100,
} as const;

export function coerceBorderShadowIntensity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return clampPercent(Math.round(value));
  }

  if (typeof value === 'string' && value in LEGACY_BORDER_SHADOW_INTENSITIES) {
    return LEGACY_BORDER_SHADOW_INTENSITIES[value as keyof typeof LEGACY_BORDER_SHADOW_INTENSITIES];
  }

  return null;
}

export function normalizeBorderShadowIntensity(value: unknown, fallback = 0): number {
  return coerceBorderShadowIntensity(value) ?? clampPercent(Math.round(fallback));
}

export function percentToUnit(value: number): number {
  return clampPercent(value) / 100;
}

export function normalizeBorderPresetVisualFields(preset: BorderPreset): BorderPreset {
  return {
    ...preset,
    shadow: normalizeBorderShadowIntensity(preset.shadow),
    strokeOpacity: preset.strokeOpacity ?? preset.opacity,
    fillColor: preset.fillColor ?? '#00000000',
    fillOpacity: preset.fillOpacity ?? 0,
    inheritCustomCss: preset.inheritCustomCss ?? false,
  };
}
