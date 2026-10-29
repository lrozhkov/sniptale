import type { CaptureActionType, QuickActionDelay } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';

export const screenshotModeLabels: Record<string, string> = {
  visible: translate('settings.quickActions.screenshotModeVisible'),
  full: translate('settings.quickActions.screenshotModeFull'),
  selection: translate('settings.quickActions.screenshotModeSelection'),
  desktop: translate('settings.quickActions.screenshotModeDesktop'),
};

export const afterCaptureLabels: Record<CaptureActionType, string> = {
  download_default: translate('settings.quickActions.afterCaptureDownloadDefault'),
  ask_preset: translate('settings.quickActions.afterCaptureAskPreset'),
  ask_system: translate('settings.quickActions.afterCaptureAskSystem'),
  edit: translate('settings.quickActions.afterCaptureEdit'),
  copy: translate('settings.quickActions.afterCaptureCopy'),
  scenario: translate('settings.quickActions.afterCaptureScenario'),
  save_to_library: translate('settings.quickActions.afterCaptureSaveToLibrary'),
};

export const delayOptions: { value: QuickActionDelay; label: string }[] = [
  { value: 0, label: translate('settings.quickActions.delayNone') },
  { value: 3, label: `3 ${translate('settings.quickActions.delayShortSuffix')}` },
  { value: 5, label: `5 ${translate('settings.quickActions.delayShortSuffix')}` },
  { value: 10, label: `10 ${translate('settings.quickActions.delayShortSuffix')}` },
];

export const qualityOptions = [
  { value: 100, label: '100%' },
  { value: 90, label: '90%' },
  { value: 80, label: '80%' },
  { value: 70, label: '70%' },
  { value: 60, label: '60%' },
];
