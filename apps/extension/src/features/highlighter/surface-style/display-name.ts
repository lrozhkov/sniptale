import type { AppLocale, TranslationKey } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';

const systemNameKeys: Record<string, TranslationKey> = {
  'system-surface-plain': 'content.callout.surfaceStyle.system.plain',
  'system-surface-ink': 'content.callout.surfaceStyle.system.ink',
  'system-surface-tonal-warm': 'content.callout.surfaceStyle.system.tonalWarm',
  'system-surface-tonal-cool': 'content.callout.surfaceStyle.system.tonalCool',
  'system-surface-frosted-light': 'content.callout.surfaceStyle.system.frostedLight',
  'system-surface-frosted-dark': 'content.callout.surfaceStyle.system.frostedDark',
  'system-surface-clear-tint': 'content.callout.surfaceStyle.system.clearTint',
  'system-surface-soft-elevated': 'content.callout.surfaceStyle.system.softElevated',
  'system-surface-acrylic-light': 'content.callout.surfaceStyle.system.acrylicLight',
  'system-surface-acrylic-dark': 'content.callout.surfaceStyle.system.acrylicDark',
  'system-surface-mica': 'content.callout.surfaceStyle.system.mica',
  'system-surface-liquid-glow': 'content.callout.surfaceStyle.system.liquidGlow',
};

export function getSurfaceStylePresetDisplayName(
  preset: { id: string; name: string; origin: string },
  locale?: AppLocale
): string {
  const key = systemNameKeys[preset.id];
  const canonicalName = `surfaceStyle.system.${preset.id.replace('system-surface-', '')}`;
  return preset.origin === 'system' && key && preset.name === canonicalName
    ? translate(key, locale)
    : preset.name;
}
