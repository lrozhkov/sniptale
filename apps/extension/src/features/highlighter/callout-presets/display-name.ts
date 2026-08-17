import type { AppLocale } from '@sniptale/platform/i18n/config';
import type { SystemCalloutPresetKey } from '@sniptale/runtime-contracts/highlighter/callout';
import { translate } from '../../../platform/i18n';

const SYSTEM_NAME_KEYS: Record<SystemCalloutPresetKey, Parameters<typeof translate>[0]> = {
  'system-callout-bubble': 'highlighter.calloutPresets.system.bubble',
  'system-callout-card': 'highlighter.calloutPresets.system.card',
  'system-callout-text': 'highlighter.calloutPresets.system.text',
  'system-callout-pointer-note': 'highlighter.calloutPresets.system.pointerNote',
  'system-callout-header-card': 'highlighter.calloutPresets.system.headerCard',
  'system-callout-framed-note': 'highlighter.calloutPresets.system.framedNote',
  'system-callout-ribbon': 'highlighter.calloutPresets.system.ribbon',
  'system-callout-sticky': 'highlighter.calloutPresets.system.sticky',
  'system-callout-terminal': 'highlighter.calloutPresets.system.terminal',
  'system-callout-editorial-caption': 'highlighter.calloutPresets.system.editorialCaption',
  'system-callout-editorial-quote': 'highlighter.calloutPresets.system.editorialQuote',
  'system-callout-editorial-proof': 'highlighter.calloutPresets.system.editorialProof',
  'system-callout-retro-sunset': 'highlighter.calloutPresets.system.retroSunset',
  'system-callout-retro-arcade': 'highlighter.calloutPresets.system.retroArcade',
  'system-callout-retro-memphis': 'highlighter.calloutPresets.system.retroMemphis',
};

export function getCalloutPresetDisplayName(
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
    preset.systemPresetKey && preset.systemPresetKey in SYSTEM_NAME_KEYS
      ? SYSTEM_NAME_KEYS[preset.systemPresetKey as SystemCalloutPresetKey]
      : undefined;
  if (preset.origin === 'system' && key !== undefined && preset.customized !== true) {
    return translate(key, locale);
  }
  return preset.name;
}
