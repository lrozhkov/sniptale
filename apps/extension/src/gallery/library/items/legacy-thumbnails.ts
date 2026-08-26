// policyStateIds: [] - this latest-only queue deduplicates derived thumbnail work and grants no authority.
import {
  getMediaAssetBlob,
  getMediaThumbnail,
  saveMediaThumbnail,
} from '../../../composition/persistence/media-library/index.library.ts';
import type { MediaThumbnailEntry } from '../../../composition/persistence/media-library/contracts';
import { listRecentScenarioSteps } from '../../../composition/persistence/scenario/store/project-steps/project-step-queries';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import {
  createVideoThumbnailBlob,
  VIDEO_THUMBNAIL_GENERATOR_VERSION,
} from '../../../platform/media-utils/video-thumbnails';
import type { GalleryItem } from './types';

const WIDTH = 320;
const HEIGHT = 180;
const pending = new Map<string, Promise<MediaThumbnailEntry | undefined>>();

function usesVideoThumbnailRenderer(item: GalleryItem): boolean {
  return (
    item.type === 'media' &&
    (item.kind === 'recording' ||
      item.kind === 'video' ||
      item.kind === 'export' ||
      item.mimeType.startsWith('video/'))
  );
}

async function render(item: GalleryItem): Promise<Blob | null> {
  if (item.type === 'scenario-export') {
    const previewStep = (await listRecentScenarioSteps(item.project.id))[0];
    if (!previewStep) return null;
    return createImageThumbnailBlob(await dataUrlToBlob(previewStep.previewDataUrl), WIDTH, HEIGHT);
  }
  if (item.type !== 'media') return null;
  const source = await getMediaAssetBlob(item.entityId ?? item.id);
  if (!source) return null;
  if (item.kind === 'screenshot' || item.kind === 'image' || source.type.startsWith('image/')) {
    return createImageThumbnailBlob(source, WIDTH, HEIGHT);
  }
  if (
    item.kind === 'recording' ||
    item.kind === 'video' ||
    item.kind === 'export' ||
    source.type.startsWith('video/')
  ) {
    return createVideoThumbnailBlob(source, WIDTH, HEIGHT);
  }
  return null;
}

export async function ensureLegacyGalleryThumbnail(
  item: GalleryItem
): Promise<MediaThumbnailEntry | undefined> {
  const existing = await getMediaThumbnail(item.id);
  const usesVideoRenderer = usesVideoThumbnailRenderer(item);
  if (
    existing &&
    (!usesVideoRenderer || existing.generatorVersion === VIDEO_THUMBNAIL_GENERATOR_VERSION)
  ) {
    return existing;
  }
  const current = pending.get(item.id);
  if (current) return current;
  const next = render(item)
    .then(async (blob) => {
      if (!blob) return undefined;
      const entry: MediaThumbnailEntry = {
        assetId: item.id,
        blob,
        createdAt: item.createdAt,
        ...(usesVideoRenderer ? { generatorVersion: VIDEO_THUMBNAIL_GENERATOR_VERSION } : {}),
        height: HEIGHT,
        updatedAt: Date.now(),
        width: WIDTH,
      };
      await saveMediaThumbnail(entry);
      return entry;
    })
    .finally(() => pending.delete(item.id));
  pending.set(item.id, next);
  return next;
}
