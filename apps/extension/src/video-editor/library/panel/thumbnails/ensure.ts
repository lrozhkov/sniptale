import {
  getMediaAssetBlob,
  getMediaThumbnail,
  saveMediaThumbnail,
} from '../../../../composition/persistence/media-library/index.library.ts';
import type { MediaThumbnailEntry } from '../../../../composition/persistence/media-library/contracts';
import { createImageThumbnailBlob } from '../../../../platform/media-utils/image-thumbnail';
import { createVideoThumbnailBlob } from '../../../../platform/media-utils/video-thumbnails';
import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import type { LibraryThumbnailItem } from './types';

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;

interface LibraryThumbnailServiceDeps {
  createImageThumbnailBlob?: typeof createImageThumbnailBlob;
  createVideoThumbnailBlob?: typeof createVideoThumbnailBlob;
  getMediaAssetBlob?: typeof getMediaAssetBlob;
  getMediaThumbnail?: typeof getMediaThumbnail;
  now?: () => number;
  saveMediaThumbnail?: typeof saveMediaThumbnail;
}

interface LibraryThumbnailService {
  ensureThumbnail: (item: LibraryThumbnailItem) => Promise<MediaThumbnailEntry | undefined>;
}

type LibraryThumbnailServiceAdapters = Required<LibraryThumbnailServiceDeps>;

function createThumbnailEntry(
  item: LibraryThumbnailItem,
  blob: Blob,
  now: () => number
): MediaThumbnailEntry {
  return {
    assetId: item.thumbnailId,
    blob,
    createdAt: item.createdAt,
    updatedAt: now(),
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
  };
}

function canUseImageThumbnail(blob: Blob, mimeType: string | null): boolean {
  return blob.type.startsWith('image/') || mimeType?.startsWith('image/') === true;
}

function canUseVideoThumbnail(blob: Blob, mimeType: string | null): boolean {
  return blob.type.startsWith('video/') || mimeType?.startsWith('video/') === true;
}

function createLibraryThumbnailServiceAdapters(
  deps: LibraryThumbnailServiceDeps
): LibraryThumbnailServiceAdapters {
  return {
    createImageThumbnailBlob: deps.createImageThumbnailBlob ?? createImageThumbnailBlob,
    createVideoThumbnailBlob: deps.createVideoThumbnailBlob ?? createVideoThumbnailBlob,
    getMediaAssetBlob: deps.getMediaAssetBlob ?? getMediaAssetBlob,
    getMediaThumbnail: deps.getMediaThumbnail ?? getMediaThumbnail,
    now: deps.now ?? Date.now,
    saveMediaThumbnail: deps.saveMediaThumbnail ?? saveMediaThumbnail,
  };
}

async function buildThumbnailEntry(args: {
  adapters: LibraryThumbnailServiceAdapters;
  item: LibraryThumbnailItem;
}): Promise<MediaThumbnailEntry | undefined> {
  const { adapters, item } = args;
  if (!item.sourceMediaId) {
    return undefined;
  }

  const blob = await adapters.getMediaAssetBlob(item.sourceMediaId);
  if (!blob) {
    return undefined;
  }

  if (canUseImageThumbnail(blob, item.mimeType)) {
    const thumbnailBlob = await adapters.createImageThumbnailBlob(
      blob,
      THUMBNAIL_WIDTH,
      THUMBNAIL_HEIGHT
    );
    return createThumbnailEntry(item, thumbnailBlob, adapters.now);
  }

  if (canUseVideoThumbnail(blob, item.mimeType)) {
    const thumbnailBlob = await adapters.createVideoThumbnailBlob(
      blob,
      THUMBNAIL_WIDTH,
      THUMBNAIL_HEIGHT
    );
    return createThumbnailEntry(item, thumbnailBlob, adapters.now);
  }

  return undefined;
}

async function persistThumbnailEntry(args: {
  adapters: LibraryThumbnailServiceAdapters;
  entry: MediaThumbnailEntry | undefined;
  item: LibraryThumbnailItem;
  pendingThumbnailLoads: Map<string, Promise<MediaThumbnailEntry | undefined>>;
}): Promise<MediaThumbnailEntry | undefined> {
  const { adapters, entry, item, pendingThumbnailLoads } = args;
  if (entry) {
    await adapters.saveMediaThumbnail(entry);
  }

  pendingThumbnailLoads.delete(item.thumbnailId);
  return entry;
}

function createPendingThumbnailLoad(args: {
  adapters: LibraryThumbnailServiceAdapters;
  item: LibraryThumbnailItem;
  pendingThumbnailLoads: Map<string, Promise<MediaThumbnailEntry | undefined>>;
}): Promise<MediaThumbnailEntry | undefined> {
  const { adapters, item, pendingThumbnailLoads } = args;
  return buildThumbnailEntry({ adapters, item })
    .then((entry) => persistThumbnailEntry({ adapters, entry, item, pendingThumbnailLoads }))
    .catch(() => {
      pendingThumbnailLoads.delete(item.thumbnailId);
      return undefined;
    });
}

function createEnsureThumbnail(args: {
  adapters: LibraryThumbnailServiceAdapters;
  pendingThumbnailLoads: Map<string, Promise<MediaThumbnailEntry | undefined>>;
}): LibraryThumbnailService['ensureThumbnail'] {
  const { adapters, pendingThumbnailLoads } = args;
  return async (item) => {
    const existing = await adapters.getMediaThumbnail(item.thumbnailId);
    if (existing) {
      return existing;
    }

    const pending = pendingThumbnailLoads.get(item.thumbnailId);
    if (pending) {
      return pending;
    }

    const next = createPendingThumbnailLoad({ adapters, item, pendingThumbnailLoads });
    pendingThumbnailLoads.set(item.thumbnailId, next);
    return next;
  };
}

export function createLibraryThumbnailService(
  deps: LibraryThumbnailServiceDeps = {}
): LibraryThumbnailService {
  const adapters = createLibraryThumbnailServiceAdapters(deps);
  const pendingThumbnailLoads = new Map<string, Promise<MediaThumbnailEntry | undefined>>();
  const ensureThumbnail = createEnsureThumbnail({ adapters, pendingThumbnailLoads });

  return { ensureThumbnail };
}

const defaultLibraryThumbnailService = createLazyDefaultOwner(createLibraryThumbnailService);

export async function ensureLibraryThumbnail(
  item: LibraryThumbnailItem
): Promise<MediaThumbnailEntry | undefined> {
  return defaultLibraryThumbnailService.getOwner().ensureThumbnail(item);
}
