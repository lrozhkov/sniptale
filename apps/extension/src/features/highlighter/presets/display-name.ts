import type { AppLocale, TranslationKey } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import type { SystemBorderPresetKey } from '../contracts';

const systemPresetNameKeys: Record<SystemBorderPresetKey, TranslationKey> = {
  'system-default': 'highlighter.systemPresets.accent',
  'system-soft-highlight': 'highlighter.systemPresets.softHighlight',
  'system-marker': 'highlighter.systemPresets.marker',
  'system-success': 'highlighter.systemPresets.done',
  'system-attention': 'highlighter.systemPresets.attention',
  'system-review': 'highlighter.systemPresets.review',
  'system-light-ui': 'highlighter.systemPresets.lightUi',
  'system-dark-ui': 'highlighter.systemPresets.darkUi',
};

export function getBorderPresetDisplayName(
  preset: {
    customized?: boolean | undefined;
    id?: string;
    name: string;
    origin?: string | undefined;
    systemPresetKey?: string | undefined;
  },
  locale?: AppLocale
): string {
  const systemNameKey =
    preset.systemPresetKey && preset.systemPresetKey in systemPresetNameKeys
      ? systemPresetNameKeys[preset.systemPresetKey as SystemBorderPresetKey]
      : undefined;
  if (preset.origin === 'system' && systemNameKey !== undefined && preset.customized !== true) {
    return translate(systemNameKey, locale);
  }

  return preset.name;
}
