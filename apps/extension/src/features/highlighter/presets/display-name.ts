import type { AppLocale, TranslationKey } from '../../../platform/i18n';
import { translate } from '../../../platform/i18n';
import type { BorderPreset, SystemBorderPresetKey } from '../contracts';

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

export function getBorderPresetDisplayName(preset: BorderPreset, locale?: AppLocale): string {
  if (
    preset.origin === 'system' &&
    preset.systemPresetKey !== undefined &&
    preset.customized !== true
  ) {
    return translate(systemPresetNameKeys[preset.systemPresetKey], locale);
  }

  return preset.name;
}
