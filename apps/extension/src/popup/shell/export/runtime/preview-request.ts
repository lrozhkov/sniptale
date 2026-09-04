import type { PopupExportPreview } from '@sniptale/runtime-contracts/export';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getPopupRuntimeErrorMessage } from '../../../diagnostics/runtime-errors';
import { translate } from '../../../../platform/i18n/popup';
import { createUserFacingErrorMessage } from '../../../../platform/i18n/user-facing-error';
import type { AppLocale } from '../../../../platform/i18n/popup';
import { sendPopupExportTabMessage } from './tab-message-routing';

type PopupExportPreviewErrorKey =
  | 'popup.export.prepareExportError'
  | 'popup.export.reloadExportError'
  | 'popup.export.startExportError';

export function getPopupExportTransportErrorMessage(
  error: unknown,
  fallbackKey: PopupExportPreviewErrorKey,
  locale?: AppLocale
): string {
  const localized = getPopupRuntimeErrorMessage(error, fallbackKey, locale);
  const genericFallback = createUserFacingErrorMessage({
    cause: error,
    detail: 'unexpected',
    ...(locale ? { locale } : { translator: translate }),
    summaryKey: fallbackKey,
  });
  return localized === genericFallback
    ? `${translate(fallbackKey, locale)}. ${translate(
        'popup.export.exportTransportErrorDetail',
        locale
      )}`
    : localized;
}

export function getPopupExportErrorMessage(
  error: unknown,
  fallbackKey: PopupExportPreviewErrorKey,
  locale?: AppLocale
): string {
  return getPopupExportTransportErrorMessage(error, fallbackKey, locale);
}

export async function requestPopupExportPreview(
  tabId: number,
  fallbackKey: PopupExportPreviewErrorKey
): Promise<PopupExportPreview> {
  const response = await sendPopupExportTabMessage(tabId, {
    type: MessageType.EXPORT_POPUP_PREVIEW,
  });

  if (!response?.success || !response.preview) {
    throw new Error(getPopupExportTransportErrorMessage(response?.error, fallbackKey));
  }

  return response.preview;
}
