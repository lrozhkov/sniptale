import type { PopupExportPreview } from '@sniptale/runtime-contracts/export';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getPopupRuntimeErrorMessage } from '../../../diagnostics/runtime-errors';
import { sendPopupExportTabMessage } from './tab-message-routing';

type PopupExportPreviewErrorKey =
  | 'popup.export.prepareExportError'
  | 'popup.export.reloadExportError'
  | 'popup.export.startExportError';

export function getPopupExportTransportErrorMessage(
  error: unknown,
  fallbackKey: PopupExportPreviewErrorKey
): string {
  return getPopupRuntimeErrorMessage(error, fallbackKey);
}

export function getPopupExportErrorMessage(
  error: unknown,
  fallbackKey: PopupExportPreviewErrorKey
): string {
  return getPopupExportTransportErrorMessage(error, fallbackKey);
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
