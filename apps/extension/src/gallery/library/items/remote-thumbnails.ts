import { createSyncProductClient } from '../../../platform/runtime-messaging/sync-product-client';
import { dataUrlToBlob } from '../../../platform/media-utils/data-url';
import type { MediaThumbnailEntry } from '../../../composition/persistence/media-library/contracts';
import type { GalleryRemoteRootItem } from './types';

/** Observe one remote thumbnail job; releasing its lease cancels only that job. */
export async function readRemoteGalleryThumbnail(
  item: GalleryRemoteRootItem,
  signal?: AbortSignal
): Promise<MediaThumbnailEntry | undefined> {
  if (signal?.aborted || !item.hasThumbnail) return undefined;
  const client = createSyncProductClient();
  const result = await client.readThumbnail(item.remote.selection);
  if (result.kind !== 'accepted') return undefined;
  const abort = () => {
    void client.cancel(result.requestId, true).catch(() => undefined);
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) {
      abort();
      return undefined;
    }
    const state = await client.waitForOperation(result.requestId, signal, true);
    if (signal?.aborted || state.job?.state !== 'ready') return undefined;
    if (state.completion?.kind !== 'thumbnail' || !state.completion.dataUrl) return undefined;
    const blob = await dataUrlToBlob(state.completion.dataUrl);
    return signal?.aborted
      ? undefined
      : {
          assetId: item.id,
          blob,
          width: state.completion.width,
          height: state.completion.height,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
  } catch (error) {
    if (signal?.aborted) return undefined;
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}
