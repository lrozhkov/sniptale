import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageRequest, RuntimeMessageResponse } from './types';

let popupExportControllerPromise: Promise<{
  handleRequest: (
    request: unknown,
    sendResponse: (response?: RuntimeMessageResponse) => void
  ) => boolean;
}> | null = null;

export function isPopupExportMessage(type?: string): boolean {
  return (
    type === MessageType.EXPORT_POPUP_PREVIEW ||
    type === MessageType.EXPORT_POPUP_START ||
    type === MessageType.EXPORT_POPUP_BUILD_PACKAGE ||
    type === MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT ||
    type === MessageType.EXPORT_POPUP_CANCEL
  );
}

export function handlePopupExportMessage(
  request: RuntimeMessageRequest,
  sendResponse: (response?: RuntimeMessageResponse) => void
): void {
  const loadPopupExportController =
    popupExportControllerPromise ??
    (popupExportControllerPromise = import('../../../parser/popup-export').then(
      ({ createPopupExportController }) => createPopupExportController()
    ));

  void loadPopupExportController
    .then((popupExportController) => {
      try {
        if (!popupExportController.handleRequest(request, sendResponse)) {
          sendResponse({
            success: false,
            error: translate('content.runtime.exportRequestHandlingFailed'),
          });
        }
      } catch (error) {
        sendResponse({
          success: false,
          error:
            error instanceof Error
              ? `handle popup export request: ${error.message}`
              : translate('content.runtime.exportModuleLoadFailed'),
        });
      }
    })
    .catch((error) => {
      sendResponse({
        success: false,
        error:
          error instanceof Error
            ? `load popup export controller: ${error.message}`
            : translate('content.runtime.exportModuleLoadFailed'),
      });
    });
}
