import type { AppLocale, TranslationKey } from '../../platform/i18n';
import { translate } from '../../platform/i18n';
import type { SystemViewportPresetKey, ViewportPreset } from './contracts';

const nameKeys: Record<SystemViewportPresetKey, TranslationKey> = {
  viewportMobilePortrait: 'viewportPresets.systemNames.viewportMobilePortrait',
  viewportMobileLandscape: 'viewportPresets.systemNames.viewportMobileLandscape',
  viewportTabletPortrait: 'viewportPresets.systemNames.viewportTabletPortrait',
  viewportTabletLandscape: 'viewportPresets.systemNames.viewportTabletLandscape',
  viewportHd: 'viewportPresets.systemNames.viewportHd',
  viewportFullHd: 'viewportPresets.systemNames.viewportFullHd',
  windowHd: 'viewportPresets.systemNames.windowHd',
  windowLaptop: 'viewportPresets.systemNames.windowLaptop',
  windowDesktop: 'viewportPresets.systemNames.windowDesktop',
  windowFullHd: 'viewportPresets.systemNames.windowFullHd',
};

export function getViewportPresetDisplayName(preset: ViewportPreset, locale?: AppLocale): string {
  if (preset.kind === 'user') return preset.name;
  if (preset.nameOverride) return preset.nameOverride;
  return translate(nameKeys[preset.systemKey], locale);
}
