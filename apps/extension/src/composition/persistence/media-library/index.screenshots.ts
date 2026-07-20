import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';
import { sanitizeProvenanceUrl } from '@sniptale/platform/security/provenance-url';
import { MEDIA_LIBRARY_STORE, THUMBNAILS_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type {
  MediaLibraryEntry,
  MediaThumbnailEntry,
  SaveScreenshotMediaAssetInput,
} from './contracts';

function createScreenshotThumbnailEntry(
  assetId: string,
  blob: Blob,
  createdAt: number,
  updatedAt: number
): MediaThumbnailEntry {
  return {
    assetId,
    blob,
    createdAt,
    updatedAt,
    width: 320,
    height: 180,
  };
}

export async function saveScreenshotMediaAsset(
  input: SaveScreenshotMediaAssetInput
): Promise<MediaLibraryEntry> {
  return runWithIndexedDbMutation(async (db) => {
    const assetId = input.id ?? crypto.randomUUID();
    const now = Date.now();
    const createdAt = input.createdAt ?? now;
    const dimensions = await measureImageBlob(input.blob);
    const thumbnailBlob = await createImageThumbnailBlob(input.blob);

    const entry: MediaLibraryEntry = {
      id: assetId,
      kind: 'screenshot',
      source: { kind: 'screenshot' },
      filename: input.filename,
      originalFilename: input.filename,
      createdAt,
      updatedAt: now,
      size: input.blob.size,
      mimeType: input.blob.type || 'image/png',
      width: dimensions.width,
      height: dimensions.height,
      duration: null,
      sourceUrl: sanitizeProvenanceUrl(input.sourceUrl),
      sourceTitle: input.sourceTitle ?? null,
      sourceFavicon: sanitizeProvenanceUrl(input.sourceFavicon),
      tags: input.tags ?? [],
      blob: input.blob,
    };

    const tx = db.transaction([MEDIA_LIBRARY_STORE, THUMBNAILS_STORE], 'readwrite');
    await tx.objectStore(MEDIA_LIBRARY_STORE).put(entry);
    await tx
      .objectStore(THUMBNAILS_STORE)
      .put(createScreenshotThumbnailEntry(assetId, thumbnailBlob, createdAt, now));
    await tx.done;

    return entry;
  });
}

export async function updateScreenshotMediaAsset(
  assetId: string,
  blob: Blob,
  filename?: string
): Promise<MediaLibraryEntry> {
  return runWithIndexedDbMutation(async (db) => {
    const existing = (await db.get(MEDIA_LIBRARY_STORE, assetId)) as MediaLibraryEntry | undefined;

    if (!existing || existing.source.kind !== 'screenshot') {
      throw new Error(`Скриншотный asset ${assetId} не найден.`);
    }

    const now = Date.now();
    const dimensions = await measureImageBlob(blob);
    const thumbnailBlob = await createImageThumbnailBlob(blob);
    const nextEntry: MediaLibraryEntry = {
      ...existing,
      filename: filename ?? existing.filename,
      size: blob.size,
      mimeType: blob.type || existing.mimeType,
      width: dimensions.width,
      height: dimensions.height,
      updatedAt: now,
      blob,
    };

    const tx = db.transaction([MEDIA_LIBRARY_STORE, THUMBNAILS_STORE], 'readwrite');
    await tx.objectStore(MEDIA_LIBRARY_STORE).put(nextEntry);
    await tx
      .objectStore(THUMBNAILS_STORE)
      .put(createScreenshotThumbnailEntry(assetId, thumbnailBlob, existing.createdAt, now));
    await tx.done;

    return nextEntry;
  });
}
