import type {
  StepBadgePreset,
  SystemStepBadgePresetKey,
} from '@sniptale/runtime-contracts/highlighter/step-badge';
import type { AppLocale } from '@sniptale/platform/i18n/config';
import { translate } from '../../../platform/i18n';

const systemKeys: Record<SystemStepBadgePresetKey, Parameters<typeof translate>[0]> = {
  'system-classic': 'highlighter.stepBadgePresets.system.classic',
  'system-outline': 'highlighter.stepBadgePresets.system.outline',
  'system-compact': 'highlighter.stepBadgePresets.system.compact',
  'system-large': 'highlighter.stepBadgePresets.system.large',
  'system-letters': 'highlighter.stepBadgePresets.system.letters',
};

export function getStepBadgePresetDisplayName(preset: StepBadgePreset, locale: AppLocale): string {
  return preset.origin === 'system' && preset.customized !== true && preset.systemPresetKey
    ? translate(systemKeys[preset.systemPresetKey], locale)
    : preset.name;
}
