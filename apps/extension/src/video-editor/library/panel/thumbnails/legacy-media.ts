import {
  getMediaAssetBlob,
  getMediaThumbnail,
  saveMediaThumbnail,
} from '../../../../composition/persistence/media-library/index.library.ts';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import { createImageThumbnailBlob } from '../../../../platform/media-utils/image-thumbnail';
import { createVideoThumbnailBlob } from '../../../../platform/media-utils/video-thumbnails';
import type { LibraryThumbnailItem } from './types';

export const LIBRARY_THUMBNAIL_WIDTH = 320;
export const LIBRARY_THUMBNAIL_HEIGHT = 180;

export interface LegacyLibraryThumbnailDeps {
  createImageThumbnailBlob?: typeof createImageThumbnailBlob;
  createVideoThumbnailBlob?: typeof createVideoThumbnailBlob;
  getMediaAssetBlob?: typeof getMediaAssetBlob;
  getMediaThumbnail?: typeof getMediaThumbnail;
  now?: () => number;
  saveMediaThumbnail?: typeof saveMediaThumbnail;
}

type LegacyAdapters = Required<LegacyLibraryThumbnailDeps>;

function createAdapters(deps: LegacyLibraryThumbnailDeps): LegacyAdapters {
  return {
    createImageThumbnailBlob: deps.createImageThumbnailBlob ?? createImageThumbnailBlob,
    createVideoThumbnailBlob: deps.createVideoThumbnailBlob ?? createVideoThumbnailBlob,
    getMediaAssetBlob: deps.getMediaAssetBlob ?? getMediaAssetBlob,
    getMediaThumbnail: deps.getMediaThumbnail ?? getMediaThumbnail,
    now: deps.now ?? Date.now,
    saveMediaThumbnail: deps.saveMediaThumbnail ?? saveMediaThumbnail,
  };
}

export async function renderLibraryThumbnail(
  item: LibraryThumbnailItem,
  deps: LegacyLibraryThumbnailDeps = {}
): Promise<MediaThumbnailEntry | undefined> {
  if (!item.sourceMediaId) return undefined;
  const adapters = createAdapters(deps);
  const source = await adapters.getMediaAssetBlob(item.sourceMediaId);
  if (!source) return undefined;

  let blob: Blob;
  if (source.type.startsWith('image/') || item.mimeType?.startsWith('image/')) {
    blob = await adapters.createImageThumbnailBlob(
      source,
      LIBRARY_THUMBNAIL_WIDTH,
      LIBRARY_THUMBNAIL_HEIGHT
    );
  } else if (source.type.startsWith('video/') || item.mimeType?.startsWith('video/')) {
    blob = await adapters.createVideoThumbnailBlob(
      source,
      LIBRARY_THUMBNAIL_WIDTH,
      LIBRARY_THUMBNAIL_HEIGHT
    );
  } else {
    return undefined;
  }

  return {
    assetId: item.thumbnailId,
    blob,
    createdAt: item.createdAt,
    height: LIBRARY_THUMBNAIL_HEIGHT,
    updatedAt: adapters.now(),
    width: LIBRARY_THUMBNAIL_WIDTH,
  };
}

export function createLegacyLibraryThumbnailService(deps: LegacyLibraryThumbnailDeps = {}) {
  const adapters = createAdapters(deps);
  const pending = new Map<string, Promise<MediaThumbnailEntry | undefined>>();
  return async (item: LibraryThumbnailItem): Promise<MediaThumbnailEntry | undefined> => {
    const existing = await adapters.getMediaThumbnail(item.thumbnailId);
    if (existing) return existing;
    const current = pending.get(item.thumbnailId);
    if (current) return current;
    const next = renderLibraryThumbnail(item, adapters)
      .then(async (entry) => {
        if (entry) await adapters.saveMediaThumbnail(entry);
        return entry;
      })
      .catch(() => undefined)
      .finally(() => pending.delete(item.thumbnailId));
    pending.set(item.thumbnailId, next);
    return next;
  };
}
