import type { AppLocale, TranslationKey } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';

const systemNameKeys: Record<string, TranslationKey> = {
  'system-sunset': 'highlighter.paintPicker.systemPresets.sunset',
  'system-ocean': 'highlighter.paintPicker.systemPresets.ocean',
  'system-aurora': 'highlighter.paintPicker.systemPresets.aurora',
  'system-radial-glow': 'highlighter.paintPicker.systemPresets.radialGlow',
  'system-conic-spectrum': 'highlighter.paintPicker.systemPresets.spectrum',
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
