import type { AppLocale, TranslationKey } from '../../platform/i18n';
import { translate } from '../../platform/i18n';
import type { SystemViewportPresetKey } from './contracts';

const nameKeys: Record<SystemViewportPresetKey, TranslationKey> = {
  windowHd: 'viewportPresets.systemNames.windowHd',
  windowLaptop: 'viewportPresets.systemNames.windowLaptop',
  windowDesktop: 'viewportPresets.systemNames.windowDesktop',
  windowFullHd: 'viewportPresets.systemNames.windowFullHd',
};

export function getViewportPresetDisplayName(
  preset: {
    kind: string;
    name?: string;
    nameOverride?: string;
    systemKey?: string;
  },
  locale?: AppLocale
): string {
  if (preset.kind === 'user') return preset.name ?? '';
  if (preset.nameOverride) return preset.nameOverride;
  const key =
    preset.systemKey && preset.systemKey in nameKeys
      ? nameKeys[preset.systemKey as SystemViewportPresetKey]
      : undefined;
  return key ? translate(key, locale) : (preset.systemKey ?? '');
}
