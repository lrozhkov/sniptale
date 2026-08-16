import type { SystemStepBadgePresetKey } from '@sniptale/runtime-contracts/highlighter/step-badge';
import type { AppLocale } from '@sniptale/platform/i18n/config';
import { translate } from '../../../platform/i18n';

const systemKeys: Record<SystemStepBadgePresetKey, Parameters<typeof translate>[0]> = {
  'system-classic': 'highlighter.stepBadgePresets.system.classic',
  'system-outline': 'highlighter.stepBadgePresets.system.outline',
  'system-compact': 'highlighter.stepBadgePresets.system.compact',
  'system-large': 'highlighter.stepBadgePresets.system.large',
  'system-letters': 'highlighter.stepBadgePresets.system.letters',
};

export function getStepBadgePresetDisplayName(
  preset: {
    customized?: boolean | undefined;
    id?: string;
    name: string;
    origin?: string | undefined;
    systemPresetKey?: string | undefined;
  },
  locale?: AppLocale
): string {
  const key =
    preset.systemPresetKey && preset.systemPresetKey in systemKeys
      ? systemKeys[preset.systemPresetKey as SystemStepBadgePresetKey]
      : undefined;
  return preset.origin === 'system' && preset.customized !== true && key
    ? translate(key, locale)
    : preset.name;
}
