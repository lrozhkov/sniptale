import type { EditorShapeSettings } from './types';
import type { BorderPreset } from '@sniptale/ui/highlighter-style/types';
import { resolveBorderPresetVisual } from '../../highlighter/style/public';
import { getColorAlpha, setColorAlpha } from '@sniptale/foundation/color';

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
    fillColor: setColorAlpha(visual.fillColor, 1) ?? visual.fillColor,
    fillOpacity: getColorAlpha(visual.fillColor) ?? 1,
    inheritCustomCss: false,
    opacity: 1,
    radius: visual.radius,
    shadow: visual.shadow,
    shadowAngle: 90,
    shadowBlur: 12,
    shadowColor: setColorAlpha(visual.strokeColor, 1) ?? visual.strokeColor,
    shadowDistance: 4,
    strokeColor: setColorAlpha(visual.strokeColor, 1) ?? visual.strokeColor,
    strokeOpacity: getColorAlpha(visual.strokeColor) ?? 1,
    strokeStyle: visual.strokeStyle,
    strokeWidth: visual.strokeWidth,
  };
}
