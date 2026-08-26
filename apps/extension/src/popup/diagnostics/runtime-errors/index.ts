import {
  createTranslator,
  SUPPORTED_LOCALES,
  translate,
  type TranslationKey,
} from '../../../platform/i18n/popup';
import { getViewportPresetErrorMessage } from '../../../features/viewport-presets/error-message';

const STALE_PAGE_RUNTIME_PATTERNS = [
  'Could not establish connection',
  'Receiving end does not exist',
  'The message port closed before a response was received',
];

const PAGE_ACCESS_REQUIRED_PATTERNS = [
  'Page access is required.',
  'Page access is required for export.',
  'Page access is required for tab recording.',
];

const LOCALIZED_RUNTIME_ERROR_MESSAGES: ReadonlyArray<{
  sourceKey: TranslationKey;
  key: TranslationKey;
}> = [
  {
    sourceKey: 'background.runtime.recordingStartTimeout',
    key: 'popup.video.startRecordingTimeout',
  },
];

function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return '';
}

export function isStalePageRuntimeErrorMessage(message: string): boolean {
  return STALE_PAGE_RUNTIME_PATTERNS.some((pattern) => message.includes(pattern));
}

export function getPopupRuntimeErrorMessage(error: unknown, fallbackKey: TranslationKey): string {
  const message = getErrorMessage(error);
  const viewportPresetError = getViewportPresetErrorMessage(message);
  if (viewportPresetError) return viewportPresetError;

  if (message && isStalePageRuntimeErrorMessage(message)) {
    return translate('popup.common.stalePageRuntimeHint');
  }

  if (PAGE_ACCESS_REQUIRED_PATTERNS.includes(message)) {
    return translate('popup.home.pageAccessRequired');
  }

  const localizedError = LOCALIZED_RUNTIME_ERROR_MESSAGES.find((entry) =>
    SUPPORTED_LOCALES.some((locale) => createTranslator(locale)(entry.sourceKey) === message)
  );
  if (localizedError) {
    return translate(localizedError.key);
  }

  return message || translate(fallbackKey);
}

export function getPopupResponseErrorMessage(
  response: unknown,
  fallbackKey: TranslationKey
): string {
  if (response && typeof response === 'object' && 'error' in response) {
    return getPopupRuntimeErrorMessage(response.error, fallbackKey);
  }

  return translate(fallbackKey);
}
