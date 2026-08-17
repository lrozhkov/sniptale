import type { AppLocale, TranslationKey } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';

const systemNameKeys: Record<string, TranslationKey> = {
  'system-sunset': 'highlighter.paintPicker.systemPresets.sunset',
  'system-ocean': 'highlighter.paintPicker.systemPresets.ocean',
  'system-aurora': 'highlighter.paintPicker.systemPresets.aurora',
  'system-lavender': 'highlighter.paintPicker.systemPresets.lavender',
  'system-peach': 'highlighter.paintPicker.systemPresets.peach',
  'system-mint': 'highlighter.paintPicker.systemPresets.mint',
  'system-midnight': 'highlighter.paintPicker.systemPresets.midnight',
  'system-graphite': 'highlighter.paintPicker.systemPresets.graphite',
  'system-radial-glow': 'highlighter.paintPicker.systemPresets.radialGlow',
  'system-radial-spotlight': 'highlighter.paintPicker.systemPresets.radialSpotlight',
  'system-conic-spectrum': 'highlighter.paintPicker.systemPresets.spectrum',
  'system-conic-halo': 'highlighter.paintPicker.systemPresets.halo',
};

export function getGradientPresetDisplayName(
  preset: { id: string; name: string; origin: string },
  locale?: AppLocale
): string {
  const key = systemNameKeys[preset.id];
  return preset.origin === 'system' && preset.name === preset.id && key
    ? translate(key, locale)
    : preset.name;
}
