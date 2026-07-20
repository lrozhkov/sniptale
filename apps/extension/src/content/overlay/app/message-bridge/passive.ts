import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  RuntimeMessageBridgeParams,
  RuntimeMessageRequest,
  RuntimeMessageResponse,
} from './types';
import { handlePopupExportMessage, isPopupExportMessage } from './passive-popup-export';
import {
  handleDiagnosticLoggerMessage,
  handleSaveDialogMessage,
  handleViewportChangedMessage,
} from './passive-controls';
import { handleQuickActionUiMessage } from './passive-quick-action';

export function createPassiveRuntimeMessageHandler(params: RuntimeMessageBridgeParams) {
  return (
    request: RuntimeMessageRequest,
    sendResponse: (response?: RuntimeMessageResponse) => void
  ) => {
    if (handleViewportChangedMessage(request, params, sendResponse)) {
      return false;
    }

    if (isPopupExportMessage(request.type)) {
      handlePopupExportMessage(request, sendResponse);
      return true;
    }

    if (handleDiagnosticLoggerMessage(request, params, sendResponse)) {
      return false;
    }

    if (handleSaveDialogMessage(request, params, sendResponse)) {
      return false;
    }

    if (handleQuickActionUiMessage(request, params, sendResponse)) {
      return (
        request.type === MessageType.COPY_IMAGE_TO_CLIPBOARD ||
        request.type === MessageType.COPY_TEXT_TO_CLIPBOARD
      );
    }

    return false;
  };
}
