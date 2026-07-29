import { captureFullPageForArchive } from '../index';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  issueExportHarStartCapability,
  isExportHarStartPreauthorized,
  isExportHarStopPreauthorized,
  startPreauthorizedExportHarSession,
  stopPreauthorizedExportHarSession,
} from '../../diagnostics/public/har-export';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import type { RouteCaptureMessage } from './types';
import type { PageAccessPort } from '../../routing-contracts/page-access-port';
import { getPreauthorizedContentActionRouteMessage } from './authorization/content-action';
import {
  registerFullPageExportRun,
  throwIfFullPageCaptureAborted,
} from '../full-page/cancellation';

export function handleRequestExportHarStartCapability(
  payload: { rawDiagnosticsEnabled?: boolean; sessionId?: string },
  resolvedTabId: number,
  sender: chrome.runtime.MessageSender | undefined,
  sendResponse: SendResponse
): boolean {
  if (!payload.sessionId) {
    sendResponse(createRouteErrorResponse('Missing HAR session id'));
    return true;
  }

  if (typeof sender?.tab?.id === 'number' && sender.tab.id !== resolvedTabId) {
    sendResponse(createRouteErrorResponse('HAR capability sender tab mismatch'));
    return true;
  }

  try {
    const capabilityToken = issueExportHarStartCapability({
      senderUrl: sender?.url,
      rawDiagnosticsEnabled: payload.rawDiagnosticsEnabled === true,
      sessionId: payload.sessionId,
      tabId: resolvedTabId,
    });
    sendResponse({ success: true, capabilityToken });
  } catch (error) {
    sendResponse(createRouteErrorResponse(error));
  }
  return true;
}

export function handleExportStartHar(
  payload: { capabilityToken?: string; sessionId?: string },
  resolvedTabId: number,
  sendResponse: SendResponse,
  sender?: chrome.runtime.MessageSender | undefined
): boolean {
  if (!payload.sessionId) {
    sendResponse(createRouteErrorResponse('Missing HAR session id'));
    return true;
  }
  if (!isExportHarStartPreauthorized(payload)) {
    sendResponse(createRouteErrorResponse('Missing HAR start capability token'));
    return true;
  }

  const { sessionId } = payload;
  startPreauthorizedExportHarSession(payload, sessionId, resolvedTabId, sender?.url)
    .then((result) => sendResponse({ success: true, result: 'accepted', ...result }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleExportStopHar(
  payload: { capabilityToken?: string; sessionId?: string },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  if (!payload.sessionId) {
    sendResponse(createRouteErrorResponse('Missing HAR session id'));
    return true;
  }

  if (!isExportHarStopPreauthorized(payload)) {
    sendResponse(createRouteErrorResponse('Missing HAR capability token'));
    return true;
  }

  stopPreauthorizedExportHarSession(
    payload,
    payload.sessionId,
    resolvedTabId,
    payload.capabilityToken ?? ''
  )
    .then((result) =>
      sendResponse({
        success: true,
        har: result.har,
        rawDiagnosticsEnabled: result.rawDiagnosticsEnabled,
      })
    )
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleExportCaptureFullPage(
  message: Extract<
    RouteCaptureMessage,
    {
      type: 'EXPORT_CAPTURE_FULL_PAGE' | 'EXPORT_CAPTURE_FULL_PAGE_UNATTENDED';
    }
  >,
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
  const unattended = message.type === MessageType.EXPORT_CAPTURE_FULL_PAGE_UNATTENDED;
  let exportRun: ReturnType<typeof registerFullPageExportRun>;
  try {
    exportRun = registerFullPageExportRun(message.exportRunId);
  } catch (error) {
    sendResponse(createRouteErrorResponse(error));
    return true;
  }
  const abortSignal = exportRun.signal;
  if (!abortSignal) {
    exportRun.release();
    sendResponse(
      createRouteErrorResponse('Full-page export cancellation authority is unavailable')
    );
    return true;
  }
  const authorize = async () => {
    if (!pageAccessPort) throw new Error('Page access port unavailable.');
    await pageAccessPort.ensureActivePageAccessRuntime(resolvedTabId);
    if (!unattended) {
      await pageAccessPort.ensureNativeVisibleCaptureAuthority(resolvedTabId);
    }
  };
  void authorize()
    .then(() => {
      throwIfFullPageCaptureAborted(abortSignal);
      return captureFullPageForArchive(resolvedTabId, {
        abortSignal,
        backendKind: unattended ? 'unattended-cdp' : 'native',
        documentId: binding.documentId,
        exportRunId: message.exportRunId,
      });
    })
    .then((capture) => {
      throwIfFullPageCaptureAborted(abortSignal);
      sendResponse({
        success: true,
        dataUrl: capture.dataUrl,
        downscaled: capture.metadata.downscaled,
        frozenExtentWarning: capture.metadata.frozenExtentWarning,
      });
    })
    .catch((error) => sendResponse(createRouteErrorResponse(error)))
    .finally(() => exportRun.release());
  return true;
}
