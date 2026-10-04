import type { MediaThumbnailEntry } from '../../../composition/persistence/media-library/contracts';
import { getAggregatePresentation } from '../../../composition/persistence/aggregate-presentations';
import type { GalleryItem } from './types';
import { ensureLegacyGalleryThumbnail } from './legacy-thumbnails';
import { getGalleryProjectCover } from './project-covers';

const THUMBNAIL_WIDTH = 320;
const THUMBNAIL_HEIGHT = 180;

function resolveEditableAggregateRef(item: GalleryItem) {
  if (
    item.type === 'media' &&
    (item.kind === 'image' || item.kind === 'screenshot') &&
    item.source.kind === 'screenshot'
  ) {
    return { id: item.entityId ?? item.id, kind: 'image' as const };
  }
  return null;
}

async function readAggregateThumbnail(item: GalleryItem): Promise<MediaThumbnailEntry | undefined> {
  const ref = resolveEditableAggregateRef(item);
  if (!ref) return undefined;
  const presentation = await getAggregatePresentation(ref);
  if (!presentation) return undefined;
  return {
    assetId: item.id,
    blob: presentation.thumbnailBlob,
    createdAt: item.createdAt,
    height: THUMBNAIL_HEIGHT,
    updatedAt: presentation.updatedAt,
    width: THUMBNAIL_WIDTH,
  };
}

export async function ensureGalleryItemThumbnail(
  item: GalleryItem,
  signal?: AbortSignal
): Promise<MediaThumbnailEntry | undefined> {
  if (item.type === 'scenario' || item.type === 'video-project') {
    const blob = await getGalleryProjectCover(item, signal);
    return blob
      ? {
          assetId: item.id,
          blob,
          createdAt: item.createdAt,
          height: 360,
          updatedAt: item.updatedAt,
          width: 640,
        }
      : undefined;
  }
  return resolveEditableAggregateRef(item)
    ? readAggregateThumbnail(item)
    : ensureLegacyGalleryThumbnail(item);
}
