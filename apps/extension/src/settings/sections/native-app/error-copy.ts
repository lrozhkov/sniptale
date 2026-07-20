import { translate, type TranslationKey } from '../../../platform/i18n';
import type { NativeSettingsWarning } from '../../../contracts/native-app';

export function normalizeNativeAppError(
  message: string | null,
  fallbackKey: TranslationKey
): string {
  if (!message) {
    return translate(fallbackKey);
  }
  const normalized = message.trim().toLowerCase();
  if (normalized === 'unknown message type') {
    return translate('settings.nativeApp.backgroundRefreshRequired');
  }
  if (
    normalized === 'specified native messaging host not found.' ||
    normalized.includes('host not found')
  ) {
    return translate('settings.nativeApp.nativeHostNotFound');
  }
  return translate(fallbackKey);
}

export function normalizeNativeSettingsWarning(warning: NativeSettingsWarning): string {
  if (warning.code === 'clamped') {
    return translate('settings.nativeApp.nativeWarningSettingsAdjusted');
  }
  if (
    warning.code === 'unsupported-capability' ||
    warning.code === 'permission-denied' ||
    warning.code === 'policy-denied'
  ) {
    return translate('settings.nativeApp.nativeWarningCapabilityUnavailable');
  }
  return translate('settings.nativeApp.nativeWarningGeneric');
}
