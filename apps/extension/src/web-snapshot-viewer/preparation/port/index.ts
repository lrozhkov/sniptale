import {
  WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
  WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
  WEB_SNAPSHOT_VIEWER_PORT,
  parseViewerExportPortRequest,
  parseViewerPreparationPortRequest,
  parseViewerPreparationCommand,
  type ViewerExportPortRequest,
  type ViewerPopupExportMessage,
  type ViewerPreparationCommand,
  type ViewerPreparationPortRequest,
  type ViewerPreparationPortResponse,
} from '../../../workflows/page-preparation';
import type { PreparationPopupSendResponse } from '../../../content/public/preparation-surface';
import { browserRuntime } from '@sniptale/platform/browser/runtime';

function createViewerExportResponseSender(
  port: chrome.runtime.Port,
  requestId: string,
  viewerPortGeneration: string
): PreparationPopupSendResponse {
  return (response) => {
    port.postMessage({
      type: WEB_SNAPSHOT_VIEWER_EXPORT_RESPONSE,
      requestId,
      viewerPortGeneration,
      response,
    });
  };
}

function handleViewerExportPortRequest(
  port: chrome.runtime.Port,
  request: ViewerExportPortRequest,
  onPopupExportRequest:
    | ((request: ViewerPopupExportMessage, sendResponse: PreparationPopupSendResponse) => void)
    | undefined
): void {
  onPopupExportRequest?.(
    request.request,
    createViewerExportResponseSender(port, request.requestId, request.viewerPortGeneration)
  );
}

function handleViewerPreparationPortRequest(
  port: chrome.runtime.Port,
  request: ViewerPreparationPortRequest,
  onCommand: (command: ViewerPreparationCommand) => void
): void {
  const response: ViewerPreparationPortResponse = {
    type: WEB_SNAPSHOT_VIEWER_PREPARATION_RESPONSE,
    requestId: request.requestId,
    success: true,
    viewerPortGeneration: request.viewerPortGeneration,
  };
  try {
    onCommand(request.command);
  } catch (error) {
    response.success = false;
    response.error =
      error instanceof Error ? error.message : 'Web snapshot viewer preparation failed.';
  }
  port.postMessage(response);
}

export function connectViewerPreparationPort(
  onCommand: (command: ViewerPreparationCommand) => void,
  onPopupExportRequest?: (
    request: ViewerPopupExportMessage,
    sendResponse: PreparationPopupSendResponse
  ) => void
): () => void {
  const port = browserRuntime.connect({ name: WEB_SNAPSHOT_VIEWER_PORT });
  const listener = (message: unknown) => {
    const exportRequest = parseViewerExportPortRequest(message);
    if (exportRequest) {
      handleViewerExportPortRequest(port, exportRequest, onPopupExportRequest);
      return;
    }

    const preparationRequest = parseViewerPreparationPortRequest(message);
    if (preparationRequest) {
      handleViewerPreparationPortRequest(port, preparationRequest, onCommand);
      return;
    }

    const command = parseViewerPreparationCommand(message);
    if (command) {
      onCommand(command);
    }
  };

  port.onMessage.addListener(listener);
  return () => {
    port.onMessage.removeListener(listener);
    port.disconnect();
  };
}
