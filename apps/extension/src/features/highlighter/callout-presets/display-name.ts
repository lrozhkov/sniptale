import type { AppLocale } from '@sniptale/platform/i18n/config';
import type {
  CalloutPreset,
  SystemCalloutPresetKey,
} from '@sniptale/runtime-contracts/highlighter/callout';
import { translate } from '../../../platform/i18n';

const SYSTEM_NAME_KEYS: Record<SystemCalloutPresetKey, Parameters<typeof translate>[0]> = {
  'system-callout-bubble': 'highlighter.calloutPresets.system.bubble',
  'system-callout-card': 'highlighter.calloutPresets.system.card',
  'system-callout-text': 'highlighter.calloutPresets.system.text',
  'system-callout-pointer-note': 'highlighter.calloutPresets.system.pointerNote',
  'system-callout-header-card': 'highlighter.calloutPresets.system.headerCard',
  'system-callout-framed-note': 'highlighter.calloutPresets.system.framedNote',
};

export function getCalloutPresetDisplayName(preset: CalloutPreset, locale?: AppLocale): string {
  if (
    preset.origin === 'system' &&
    preset.systemPresetKey !== undefined &&
    preset.customized !== true
  ) {
    return translate(SYSTEM_NAME_KEYS[preset.systemPresetKey], locale);
  }
  return preset.name;
}
