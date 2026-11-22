import type { CaptureActionType, QuickActionDelay } from '../../../../../contracts/settings';
import { translate } from '../../../../../platform/i18n';

export const screenshotModeLabels: Record<string, string> = {
  get visible() {
    return translate('settings.quickActions.screenshotModeVisible');
  },
  get full() {
    return translate('settings.quickActions.screenshotModeFull');
  },
  get selection() {
    return translate('settings.quickActions.screenshotModeSelection');
  },
  get desktop() {
    return translate('settings.quickActions.screenshotModeDesktop');
  },
};

export const afterCaptureLabels: Record<CaptureActionType, string> = {
  get download_default() {
    return translate('settings.quickActions.afterCaptureDownloadDefault');
  },
  get ask_preset() {
    return translate('settings.quickActions.afterCaptureAskPreset');
  },
  get ask_system() {
    return translate('settings.quickActions.afterCaptureAskSystem');
  },
  get edit() {
    return translate('settings.quickActions.afterCaptureEdit');
  },
  get copy() {
    return translate('settings.quickActions.afterCaptureCopy');
  },
  get scenario() {
    return translate('settings.quickActions.afterCaptureScenario');
  },
  get save_to_library() {
    return translate('settings.quickActions.afterCaptureSaveToLibrary');
  },
};

export const delayOptions: { value: QuickActionDelay; label: string }[] = [
  {
    value: 0,
    get label() {
      return translate('settings.quickActions.delayNone');
    },
  },
  {
    value: 3,
    get label() {
      return `3 ${translate('settings.quickActions.delayShortSuffix')}`;
    },
  },
  {
    value: 5,
    get label() {
      return `5 ${translate('settings.quickActions.delayShortSuffix')}`;
    },
  },
  {
    value: 10,
    get label() {
      return `10 ${translate('settings.quickActions.delayShortSuffix')}`;
    },
  },
];

export const qualityOptions = [
  { value: 100, label: '100%' },
  { value: 90, label: '90%' },
  { value: 80, label: '80%' },
  { value: 70, label: '70%' },
  { value: 60, label: '60%' },
];
