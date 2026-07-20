import { blobToDataUrl, dataUrlToBlob } from '../../../platform/media-utils/data-url';
import {
  deletePendingScenarioAsset,
  getPendingScenarioAsset,
  savePendingScenarioAsset,
} from '../../../composition/persistence/scenario/projects';
import type {
  PendingScenarioCapture,
  PendingScenarioCaptureInput,
  ResolvedPendingScenarioCapture,
} from './types';

/**
 * Persists a pending scenario capture blob in the scenario-owned temp asset store.
 */
export async function stagePendingScenarioCapture(
  tabId: number,
  capture: PendingScenarioCaptureInput
): Promise<PendingScenarioCapture> {
  const blob = await dataUrlToBlob(capture.dataUrl);
  const pendingAssetId = crypto.randomUUID();
  const createdAt = Date.now();

  await savePendingScenarioAsset({
    id: pendingAssetId,
    tabId,
    galleryAssetId: capture.galleryAssetId,
    blob,
    mimeType: blob.type || 'image/png',
    createdAt,
    size: blob.size,
  });

  return {
    id: capture.id,
    pendingAssetId,
    filename: capture.filename,
    galleryAssetId: capture.galleryAssetId,
    captureSurface: capture.captureSurface,
    sourceKind: capture.sourceKind,
    page: capture.page,
    target: capture.target,
    interactionPoint: capture.interactionPoint,
    cursorPoint: capture.cursorPoint,
    ...(capture.captureMetadata !== undefined ? { captureMetadata: capture.captureMetadata } : {}),
    title: capture.title,
    body: capture.body,
  };
}

/**
 * Restores a pending capture payload for flush paths from the scenario temp asset store.
 */
export async function resolvePendingScenarioCapture(
  capture: PendingScenarioCapture
): Promise<ResolvedPendingScenarioCapture | null> {
  const asset = await getPendingScenarioAsset(capture.pendingAssetId);
  if (!asset?.blob) {
    return null;
  }

  return {
    ...capture,
    dataUrl: await blobToDataUrl(asset.blob),
  };
}

/**
 * Removes a staged pending capture blob from the scenario temp asset store.
 */
export async function clearPendingScenarioCaptureAsset(
  capture: PendingScenarioCapture | null
): Promise<void> {
  if (!capture) {
    return;
  }

  await deletePendingScenarioAsset(capture.pendingAssetId);
}
