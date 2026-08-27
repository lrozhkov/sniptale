import { captureFullPageForArchive } from '../index';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import type { RouteCaptureMessage } from './types';
import type { PageAccessPort } from '../../routing-contracts/page-access-port';
import { getPreauthorizedContentActionRouteMessage } from './authorization/content-action';
import {
  registerFullPageExportRun,
  throwIfFullPageCaptureAborted,
} from '../full-page/cancellation';

export function handleExportCaptureFullPage(
  message: Extract<RouteCaptureMessage, { type: 'EXPORT_CAPTURE_FULL_PAGE' }>,
  resolvedTabId: number,
  sendResponse: SendResponse,
  pageAccessPort?: PageAccessPort
): boolean {
  const binding = getPreauthorizedContentActionRouteMessage(message);
  if (!binding || binding.tabId !== resolvedTabId) {
    sendResponse(createRouteErrorResponse('Full-page export document binding is unavailable'));
    return true;
  }
  if (message.contentIntent?.requestId !== message.exportRunId) {
    sendResponse(createRouteErrorResponse('Full-page export capability identity mismatch'));
    return true;
  }
  let exportRun: ReturnType<typeof registerFullPageExportRun>;
  try {
    exportRun = registerFullPageExportRun(message.exportRunId);
  } catch (error) {
    sendResponse(createRouteErrorResponse(error));
    return true;
  }
  const abortSignal = exportRun.signal;
  const authorize = async () => {
    if (!pageAccessPort) throw new Error('Page access port unavailable.');
    await pageAccessPort.ensureActivePageAccessRuntime(resolvedTabId);
    await pageAccessPort.ensureNativeVisibleCaptureAuthority(resolvedTabId);
  };
  void authorize()
    .then(() => {
      throwIfFullPageCaptureAborted(abortSignal);
      return captureFullPageForArchive(resolvedTabId, {
        abortSignal,
        backendKind: 'native',
        documentId: binding.documentId,
        exportRunId: message.exportRunId,
      });
    })
    .then((capture) => {
      throwIfFullPageCaptureAborted(abortSignal);
      sendResponse({
        success: true,
        ...(capture.metadata.captureGeometry === undefined
          ? {}
          : { captureGeometry: capture.metadata.captureGeometry }),
        dataUrl: capture.dataUrl,
        downscaled: capture.metadata.downscaled,
        frozenExtentWarning: capture.metadata.frozenExtentWarning,
      });
    })
    .catch((error) => sendResponse(createRouteErrorResponse(error)))
    .finally(() => exportRun.release());
  return true;
}
