import {
  readAssetResidencyCopyInTransaction,
  retireAssetResidencyCopyInTransaction,
} from '../assets/residency';
import { assetResidencyCopyId } from '../assets/residency-records';
import { ASSET_RESIDENCY_STORE } from '../infrastructure/indexed-db/core.stores';
import { captureImageInTransaction, readImageRevisionFence } from '../sync-capture/capture';
import { ASSET_REFS_STORE, SYNC_CAPTURE_STORE } from '../infrastructure/indexed-db/core.stores';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { MediaLibraryEntry, SaveScreenshotMediaAssetInput } from './contracts';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { ImageAggregateCollisionError } from '../image-aggregates/errors';

export async function saveScreenshotMediaAsset(
  input: SaveScreenshotMediaAssetInput
): Promise<MediaLibraryEntry> {
  return runWithIndexedDbMutation(async (db, permit) => {
    const assetId = input.id ?? crypto.randomUUID();
    const now = Date.now();
    const createdAt = input.createdAt ?? now;
    const dimensions = await measureImageBlob(input.blob);
    const thumbnailBlob = await createImageThumbnailBlob(input.blob);

    const entry: MediaLibraryEntry = {
      id: assetId,
      kind: input.kind ?? 'screenshot',
      source: { kind: 'screenshot' },
      filename: input.filename,
      originalFilename: input.filename,
      createdAt,
      updatedAt: now,
      size: input.blob.size,
      mimeType: input.blob.type || 'image/png',
      width: dimensions.width,
      height: dimensions.height,
      imageContentState: 'original',
      duration: null,
      sourceUrl: sanitizeProvenanceUrl(input.sourceUrl),
      sourceTitle: input.sourceTitle ?? null,
      sourceFavicon: sanitizeProvenanceUrl(input.sourceFavicon),
      tags: input.tags ?? [],
      lifecycle: createLibraryLifecycle(input.storageClass ?? 'library', now),
      workspaceRevision: 0,
      blob: input.blob,
    };

    const tx = db.transaction(
      [
        MEDIA_LIBRARY_STORE,
        ASSET_RESIDENCY_STORE,
        IMAGE_WORKSPACES_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        ASSET_REFS_STORE,
        SYNC_CAPTURE_STORE,
      ],
      'readwrite'
    );
    try {
      const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
      const workspaceStore = tx.objectStore(IMAGE_WORKSPACES_STORE);
      const presentationStore = tx.objectStore(AGGREGATE_PRESENTATIONS_STORE);
      const occupiedRoot: unknown = await mediaStore.get(assetId);
      const occupiedWorkspace: unknown = await workspaceStore.get(assetId);
      const occupiedPresentation: unknown = await presentationStore.get(['image', assetId]);
      if (
        occupiedRoot !== undefined ||
        occupiedWorkspace !== undefined ||
        occupiedPresentation !== undefined
      ) {
        throw new ImageAggregateCollisionError(assetId);
      }
      const fence = await readImageRevisionFence(tx, assetId);
      if (fence !== null) {
        if (!Number.isSafeInteger(fence + 1)) throw new Error('Image revision exhausted.');
        entry.workspaceRevision = fence + 1;
      }
      const previousCopy = await readAssetResidencyCopyInTransaction(
        tx,
        assetResidencyCopyId({ kind: 'inline-image', mediaId: assetId })
      );
      if (previousCopy) await retireAssetResidencyCopyInTransaction(tx, previousCopy, permit);
      await mediaStore.put(entry);
      await presentationStore.put({
        aggregateId: assetId,
        aggregateKind: 'image',
        presentationRevision: entry.workspaceRevision ?? 0,
        previewBlob: input.blob,
        thumbnailBlob,
        updatedAt: now,
      });
      await captureImageInTransaction(tx, assetId);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already have aborted. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }

    return entry;
  });
}
