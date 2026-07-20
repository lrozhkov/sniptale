import type { EditorShapeSettings } from './types';
import { percentToUnit } from '@sniptale/ui/highlighter-style/normalize';
import type { BorderPreset } from '@sniptale/ui/highlighter-style/types';
import { resolveBorderPresetVisual } from '../../highlighter/style/public';

interface HighlighterPresetSettings {
  borderPresets: BorderPreset[];
  defaultBorderPresetId: string;
}

export function resolveDefaultBorderPreset(
  settings: HighlighterPresetSettings | null | undefined,
  fallbackPreset: BorderPreset
): BorderPreset {
  if (!settings) {
    return { ...fallbackPreset };
  }

  const preset =
    settings.borderPresets.find((item) => item.id === settings.defaultBorderPresetId) ??
    fallbackPreset;

  return { ...preset };
}

export function resolveDefaultBorderPresetVisual(
  settings: HighlighterPresetSettings | null | undefined,
  fallbackPreset: BorderPreset
) {
  return resolveBorderPresetVisual(resolveDefaultBorderPreset(settings, fallbackPreset));
}

export function projectBorderPresetToEditorShapeSettings(
  preset: BorderPreset
): EditorShapeSettings {
  const visual = resolveBorderPresetVisual(preset);

  return {
    borderPresetId: visual.id,
    customCss: '',
    fillColor: visual.fillColor,
    fillOpacity: percentToUnit(visual.fillOpacity),
    inheritCustomCss: false,
    opacity: percentToUnit(visual.strokeOpacity),
    radius: visual.radius,
    shadow: visual.shadow,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: visual.strokeColor,
    shadowDistance: 4,
    strokeColor: visual.strokeColor,
    strokeOpacity: percentToUnit(visual.strokeOpacity),
    strokeStyle: visual.strokeStyle,
    strokeWidth: visual.strokeWidth,
  };
}
