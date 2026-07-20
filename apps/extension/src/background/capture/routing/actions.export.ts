import { captureFullPageForArchive } from '../index';
import {
  issueExportHarStartCapability,
  isExportHarStartPreauthorized,
  isExportHarStopPreauthorized,
  startPreauthorizedExportHarSession,
  stopPreauthorizedExportHarSession,
} from '../../diagnostics/public/har-export';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';

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
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  captureFullPageForArchive(resolvedTabId)
    .then((dataUrl) => sendResponse({ success: true, dataUrl }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
