import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { SendResponse } from './types';
import { fetchWebSnapshotAssetsForSession } from './web-snapshot/fetch';
import {
  extendWebSnapshotAssetSession,
  registerWebSnapshotAssetSession,
} from './web-snapshot/session';
import { updateActivePagePackageJobProducerProgress } from '../page-package/job/active-job';

export function handleFetchWebSnapshotAsset(
  payload: { snapshotSessionId: string; urls: string[] },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  fetchWebSnapshotAssetsForSession({
    sessionId: payload.snapshotSessionId,
    tabId: resolvedTabId,
    urls: payload.urls,
  })
    .then((assets) => sendResponse({ assets, success: true }))
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

export function handleWebSnapshotSaveProgress(
  payload: {
    activeStepKey: import('@sniptale/runtime-contracts/export').ExportProgressStepKey;
    current: number;
    requestId: string;
    total: number;
  },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  updateActivePagePackageJobProducerProgress({
    activeStepKey: payload.activeStepKey,
    current: payload.current,
    requestId: payload.requestId,
    tabId: resolvedTabId,
    total: payload.total,
  })
    .then(() => sendResponse())
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}
