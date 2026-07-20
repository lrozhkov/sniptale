import {
  getMediaAssetBlob,
  getMediaThumbnail,
  saveMediaThumbnail,
} from '../../../composition/persistence/media-library/index.library.ts';
import type { MediaThumbnailEntry } from '../../../composition/persistence/media-library/contracts';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import { createVideoThumbnailBlob } from '../../../platform/media-utils/video-thumbnails';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { listRecentScenarioSteps } from '../../../composition/persistence/scenario/store/project-steps/project-step-queries';
import type { GalleryItem } from './types';

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;
const pendingThumbnailLoads = new Map<string, Promise<MediaThumbnailEntry | undefined>>();

function createThumbnailEntry(assetId: string, createdAt: number, blob: Blob): MediaThumbnailEntry {
  const now = Date.now();
  return {
    assetId,
    blob,
    createdAt,
    updatedAt: now,
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
  };
}

async function buildMediaThumbnail(item: GalleryItem): Promise<Blob | null> {
  if (item.type !== 'media' && item.type !== 'video-project') {
    return null;
  }

  const assetId =
    item.type === 'video-project' ? item.thumbnailSourceMediaId : (item.entityId ?? item.id);
  if (!assetId) {
    return null;
  }

  const blob = await getMediaAssetBlob(assetId);
  if (!blob) {
    return null;
  }

  if (item.kind === 'screenshot' || item.kind === 'image' || blob.type.startsWith('image/')) {
    return createImageThumbnailBlob(blob, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  }

  if (
    item.kind === 'recording' ||
    item.kind === 'video' ||
    item.kind === 'export' ||
    blob.type.startsWith('video/')
  ) {
    return createVideoThumbnailBlob(blob, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
  }

  return null;
}

async function buildScenarioThumbnail(item: GalleryItem): Promise<Blob | null> {
  if (item.type !== 'scenario' && item.type !== 'scenario-export') {
    return null;
  }

  const recentSteps = await listRecentScenarioSteps(item.project.id);
  const previewStep = recentSteps[0];
  if (!previewStep) {
    return null;
  }

  const previewBlob = await dataUrlToBlob(previewStep.previewDataUrl);
  return createImageThumbnailBlob(previewBlob, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);
}

async function buildThumbnailEntry(item: GalleryItem): Promise<MediaThumbnailEntry | undefined> {
  const generatedBlob =
    (await buildMediaThumbnail(item)) ?? (await buildScenarioThumbnail(item)) ?? null;
  if (!generatedBlob) {
    return undefined;
  }

  return createThumbnailEntry(item.id, item.createdAt, generatedBlob);
}

async function persistThumbnailEntry(
  itemId: string,
  entry: MediaThumbnailEntry | undefined
): Promise<MediaThumbnailEntry | undefined> {
  if (entry) {
    await saveMediaThumbnail(entry);
  }

  pendingThumbnailLoads.delete(itemId);
  return entry;
}

export async function ensureGalleryItemThumbnail(
  item: GalleryItem
): Promise<MediaThumbnailEntry | undefined> {
  const existing = await getMediaThumbnail(item.id);
  if (existing) {
    return existing;
  }

  const pending = pendingThumbnailLoads.get(item.id);
  if (pending) {
    return pending;
  }

  const next = buildThumbnailEntry(item)
    .then((entry) => persistThumbnailEntry(item.id, entry))
    .catch((error) => {
      pendingThumbnailLoads.delete(item.id);
      throw error;
    });

  pendingThumbnailLoads.set(item.id, next);
  return next;
}
