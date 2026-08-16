import type { AppLocale, TranslationKey } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';

const systemNameKeys: Record<string, TranslationKey> = {
  'system-surface-plain': 'content.callout.surfaceStyle.system.plain',
  'system-surface-frosted-light': 'content.callout.surfaceStyle.system.frostedLight',
  'system-surface-frosted-dark': 'content.callout.surfaceStyle.system.frostedDark',
  'system-surface-clear-tint': 'content.callout.surfaceStyle.system.clearTint',
  'system-surface-soft-elevated': 'content.callout.surfaceStyle.system.softElevated',
};

export function getSurfaceStylePresetDisplayName(
  preset: { id: string; name: string; origin: string },
  locale?: AppLocale
): string {
  const key = systemNameKeys[preset.id];
  return preset.origin === 'system' && key && preset.name === key.replace('content.callout.', '')
    ? translate(key, locale)
    : preset.name;
}
