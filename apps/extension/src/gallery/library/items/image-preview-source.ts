import { getAggregatePreviewBlob } from '../../../composition/persistence/aggregate-presentations';
import { getMediaAssetBlob } from '../../../composition/persistence/media-library/index.library';
import type { GalleryMediaItem } from './types';

/** Only an unchanged original can use its source bytes in place of a missing presentation. */
export async function readGalleryImagePreview(item: GalleryMediaItem): Promise<Blob | null> {
  const id = item.entityId ?? item.id;
  const preview = await getAggregatePreviewBlob({ id, kind: 'image' });
  if (preview || item.imageContentState !== 'original') return preview ?? null;
  return (await getMediaAssetBlob(id)) ?? null;
}
