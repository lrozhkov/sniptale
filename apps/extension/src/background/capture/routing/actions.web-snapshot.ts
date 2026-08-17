import { saveWebSnapshotToMediaHub } from '../../media-hub/web-snapshot';
import { deleteMediaLibraryAssetsBatchSafely } from '../../../workflows/media-hub/store';
import { createRouteErrorResponse } from '../../routing-contracts/response';
import type { WebSnapshotSaveToGalleryPayload } from '@sniptale/runtime-contracts/web-snapshot';
import type { SendResponse } from './types';
import { fetchWebSnapshotAssetForSession } from './web-snapshot/fetch';
import {
  assertWebSnapshotSessionOpen,
  assertWebSnapshotSessionOwner,
  beginWebSnapshotSave,
  commitWebSnapshotSave,
  releaseWebSnapshotSave,
  registerWebSnapshotAssetSession,
} from './web-snapshot/session';
import {
  releaseWebSnapshotStagedBlobs,
  releaseWebSnapshotStagedBlobsForSession,
  stageWebSnapshotBlobChunk,
} from './web-snapshot/staged-blobs';
import { resolveWebSnapshotPayloadBlobs } from './web-snapshot/payload-blobs';
import { hasActivePageAccess } from '../../page-access/service';
import { securityE2ECheckpoint } from '../../../platform/security-e2e-control';

function resolveWebSnapshotPayloadBlobsForSave(
  payload: WebSnapshotSaveToGalleryPayload,
  tabId: number
) {
  try {
    return resolveWebSnapshotPayloadBlobs(payload, tabId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`resolve web snapshot payload blobs: ${message}`, { cause: error });
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

export function handleReleaseWebSnapshotStagedBlobs(
  payload: { snapshotSessionId: string },
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  Promise.resolve()
    .then(() => {
      assertWebSnapshotSessionOwner({
        sessionId: payload.snapshotSessionId,
        tabId: resolvedTabId,
      });
      releaseWebSnapshotStagedBlobsForSession({
        snapshotSessionId: payload.snapshotSessionId,
        tabId: resolvedTabId,
      });
      sendResponse({ success: true, result: 'released' });
    })
    .catch((error) => sendResponse(createRouteErrorResponse(error)));
  return true;
}

export function handleSaveWebSnapshotToGallery(
  payload: WebSnapshotSaveToGalleryPayload,
  resolvedTabId: number,
  sendResponse: SendResponse
): boolean {
  let saveStarted = false;
  let savedAssetId: string | null = null;

  Promise.resolve()
    .then(async () => {
      beginWebSnapshotSave({
        sessionId: payload.snapshotSessionId,
        tabId: resolvedTabId,
      });
      saveStarted = true;
      const blobs = resolveWebSnapshotPayloadBlobsForSave(payload, resolvedTabId);
      if (typeof __SNIPTALE_SECURITY_E2E__ !== 'undefined' && __SNIPTALE_SECURITY_E2E__) {
        await securityE2ECheckpoint('persistence-before-commit');
      }
      if (!(await hasActivePageAccess(resolvedTabId))) {
        throw new Error('Page access was revoked before web snapshot commit');
      }
      return saveWebSnapshotToMediaHub({
        ...blobs,
        payload,
      });
    })
    .then((assetId) => {
      savedAssetId = assetId;
      commitWebSnapshotSave({
        assetId,
        sessionId: payload.snapshotSessionId,
        tabId: resolvedTabId,
      });
      releaseWebSnapshotStagedBlobs({
        ...payload,
        tabId: resolvedTabId,
      });
      sendResponse({ success: true, assetId });
    })
    .catch(async (error: unknown) => {
      let finalError: unknown = error;
      if (savedAssetId) {
        try {
          await deleteMediaLibraryAssetsBatchSafely([savedAssetId]);
          savedAssetId = null;
        } catch (cleanupError) {
          finalError = new AggregateError(
            [error, cleanupError],
            'Web snapshot save cancellation cleanup failed'
          );
        }
      }
      releaseWebSnapshotStagedBlobs({
        ...payload,
        tabId: resolvedTabId,
      });
      if (saveStarted) {
        try {
          releaseWebSnapshotSave({
            sessionId: payload.snapshotSessionId,
            tabId: resolvedTabId,
          });
        } catch {
          // Preserve the original save failure for the runtime response.
        }
      }
      sendResponse(createRouteErrorResponse(finalError));
    });
  return true;
}
