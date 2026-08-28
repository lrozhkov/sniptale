import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import { fetchWebSnapshotAssetForSession } from './web-snapshot/fetch';
import {
  extendWebSnapshotAssetSession,
  registerWebSnapshotAssetSession,
} from './web-snapshot/session';

export function handleFetchWebSnapshotAsset(
  payload: { snapshotSessionId: string; url: string },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  fetchWebSnapshotAssetForSession({
    sessionId: payload.snapshotSessionId,
    tabId: resolvedTabId,
    url: payload.url,
  })
    .then((asset) => sendResponse({ success: true, ...asset }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleRegisterWebSnapshotAssets(
  payload: { assetUrls: string[]; requestId: string; snapshotSessionId?: string },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  Promise.resolve()
    .then(() => {
      if (payload.snapshotSessionId) {
        extendWebSnapshotAssetSession({
          assetUrls: payload.assetUrls,
          sessionId: payload.snapshotSessionId,
          tabId: resolvedTabId,
        });
        return payload.snapshotSessionId;
      }
      return registerWebSnapshotAssetSession(resolvedTabId, payload.requestId, payload.assetUrls);
    })
    .then((snapshotSessionId) => sendResponse({ success: true, snapshotSessionId }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
