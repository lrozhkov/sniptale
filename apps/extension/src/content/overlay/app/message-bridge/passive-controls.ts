import { translate } from '../../../../platform/i18n';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { isImageDataUrl } from '@sniptale/runtime-contracts/validation/data-url';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type {
  RuntimeMessageBridgeParams,
  RuntimeMessageRequest,
  RuntimeMessageResponse,
} from './types';

export function handleViewportChangedMessage(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams,
  sendResponse: (response?: RuntimeMessageResponse) => void
): boolean {
  if (request.type !== MessageType.VIEWPORT_CHANGED) {
    return false;
  }

  params.viewport.setCurrentViewport(request.viewport ?? null);
  sendResponse({ success: true });
  return true;
}

export function handleDiagnosticLoggerMessage(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams,
  sendResponse: (response?: RuntimeMessageResponse) => void
): boolean {
  if (request.type === VideoMessageType.ENABLE_DIAGNOSTIC_LOGGER) {
    if (request.recordingId) {
      params.diagnostics.enableDiagnosticLogger(request.recordingId);
    }

    sendResponse({ success: true });
    return true;
  }

  if (request.type === VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER) {
    params.diagnostics.disableDiagnosticLogger();
    sendResponse({ success: true });
    return true;
  }

  return false;
}

export function handleSaveDialogMessage(
  request: RuntimeMessageRequest,
  params: RuntimeMessageBridgeParams,
  sendResponse: (response?: RuntimeMessageResponse) => void
): boolean {
  if (request.type !== MessageType.SHOW_SAVE_DIALOG) {
    return false;
  }

  if (request.dataUrl !== undefined && !isImageDataUrl(request.dataUrl)) {
    sendResponse({
      success: false,
      error: translate('content.runtime.invalidImageData'),
    });
    return true;
  }

  if (request.dataUrl && request.filename) {
    params.dialogs.setSaveDialogState({
      dataUrl: request.dataUrl,
      filename: request.filename,
    });
  }

  sendResponse({ success: true });
  return true;
}
