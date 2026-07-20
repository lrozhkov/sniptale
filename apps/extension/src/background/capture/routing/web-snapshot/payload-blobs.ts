import type { WebSnapshotSaveToGalleryPayload } from '@sniptale/runtime-contracts/web-snapshot';
import { consumeWebSnapshotStagedBlob } from './staged-blobs';

export function resolveWebSnapshotPayloadBlobs(
  payload: WebSnapshotSaveToGalleryPayload,
  tabId: number | undefined
): { packageBlob: Blob; screenshotBlob: Blob } {
  if (typeof tabId !== 'number') {
    throw new Error('Web snapshot payload transfer is invalid');
  }

  const packageBlob = consumeWebSnapshotStagedBlob({
    expectedKind: 'package',
    snapshotSessionId: payload.snapshotSessionId,
    stagedBlobId: payload.packageStagedBlobId,
    tabId,
    type: 'application/x-sniptale-web-snapshot+zip',
  });
  const screenshotBlob = consumeWebSnapshotStagedBlob({
    expectedKind: 'screenshot',
    snapshotSessionId: payload.snapshotSessionId,
    stagedBlobId: payload.screenshotStagedBlobId,
    tabId,
    type: payload.screenshotMimeType,
  });

  return { packageBlob, screenshotBlob };
}
