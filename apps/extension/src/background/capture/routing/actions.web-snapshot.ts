import { saveWebSnapshotToMediaHub } from '../../media-hub/web-snapshot';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { WebSnapshotSaveToGalleryPayload } from '@sniptale/runtime-contracts/web-snapshot';
import type { SendResponse } from './types';
import { fetchWebSnapshotAssetForSession } from './web-snapshot/fetch';
import {
  assertWebSnapshotSessionOpen,
  beginWebSnapshotSave,
  commitWebSnapshotSave,
  releaseWebSnapshotSave,
  registerWebSnapshotAssetSession,
} from './web-snapshot/session';
import {
  releaseWebSnapshotStagedBlobs,
  stageWebSnapshotBlobChunk,
} from './web-snapshot/staged-blobs';
import { resolveWebSnapshotPayloadBlobs } from './web-snapshot/payload-blobs';

function resolveWebSnapshotPayloadBlobsForSave(
  payload: WebSnapshotSaveToGalleryPayload,
  tabId: number
) {
  try {
    return resolveWebSnapshotPayloadBlobs(payload, tabId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`resolve web snapshot payload blobs: ${message}`);
  }
}

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
  payload: { assetUrls: string[]; requestId: string },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  Promise.resolve()
    .then(() =>
      registerWebSnapshotAssetSession(resolvedTabId, payload.requestId, payload.assetUrls)
    )
    .then((snapshotSessionId) => sendResponse({ success: true, snapshotSessionId }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleStageWebSnapshotBlobChunk(
  payload: {
    base64: string;
    blobKind: 'package' | 'screenshot';
    chunkIndex: number;
    snapshotSessionId: string;
    stagedBlobId: string;
    totalBytes: number;
    totalChunks: number;
  },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  Promise.resolve()
    .then(() => {
      assertWebSnapshotSessionOpen({
        sessionId: payload.snapshotSessionId,
        tabId: resolvedTabId,
      });
      return stageWebSnapshotBlobChunk({
        base64: payload.base64,
        chunkIndex: payload.chunkIndex,
        kind: payload.blobKind,
        snapshotSessionId: payload.snapshotSessionId,
        stagedBlobId: payload.stagedBlobId,
        tabId: resolvedTabId,
        totalBytes: payload.totalBytes,
        totalChunks: payload.totalChunks,
      });
    })
    .then((result) => sendResponse({ success: true, ...result }))
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleSaveWebSnapshotToGallery(
  payload: WebSnapshotSaveToGalleryPayload,
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  let saveStarted = false;

  Promise.resolve()
    .then(() => {
      beginWebSnapshotSave({
        sessionId: payload.snapshotSessionId,
        tabId: resolvedTabId,
      });
      saveStarted = true;
      return saveWebSnapshotToMediaHub({
        ...resolveWebSnapshotPayloadBlobsForSave(payload, resolvedTabId),
        payload,
      });
    })
    .then((assetId) => {
      commitWebSnapshotSave({
        sessionId: payload.snapshotSessionId,
        tabId: resolvedTabId,
      });
      releaseWebSnapshotStagedBlobs({
        ...payload,
        tabId: resolvedTabId,
      });
      sendResponse({ success: true, assetId });
    })
    .catch((error) => {
      if (saveStarted) {
        releaseWebSnapshotStagedBlobs({
          ...payload,
          tabId: resolvedTabId,
        });
        try {
          releaseWebSnapshotSave({
            sessionId: payload.snapshotSessionId,
            tabId: resolvedTabId,
          });
        } catch {
          // Preserve the original save failure for the runtime response.
        }
      }
      sendResponse(createRouteErrorResponse(error));
    });
  return true;
}
