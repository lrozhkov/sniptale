import { prepareProjectAsset } from '../persistence/projects';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';
import { getMediaAssetBlob, getMediaLibraryEntry } from '../persistence/media-library';
import { getAggregatePresentation } from '../persistence/aggregate-presentations';
import { prepareBackgroundImage } from '../../workflows/background-images/intake';
import { BUNDLED_BACKGROUNDS } from '../persistence/background-presets/bundled';

/** Optional acquisition policy receives original bytes before normalization. */
export type BackgroundImagePreparation = (file: File, signal?: AbortSignal) => Promise<File>;

export interface AcquiredBackground {
  file: File;
  originMediaId?: string;
}
/** Read a current Library presentation without publishing another Library identity. */
export async function readLibraryBackground(
  mediaId: string,
  signal?: AbortSignal,
  prepareImage: BackgroundImagePreparation = prepareBackgroundImage
): Promise<AcquiredBackground> {
  signal?.throwIfAborted();
  const entry = await getMediaLibraryEntry(mediaId);
  if (
    !entry ||
    entry.lifecycle?.trashedAt !== undefined ||
    !['image', 'screenshot'].includes(entry.kind)
  )
    throw new Error('Background image unavailable');
  const revision = entry.workspaceRevision ?? 0;
  const presentation = await getAggregatePresentation({ kind: 'image', id: entry.id });
  const blob =
    presentation?.presentationRevision === revision
      ? presentation.previewBlob
      : revision === 0
        ? await getMediaAssetBlob(entry.id)
        : undefined;
  const latest = await getMediaLibraryEntry(mediaId);
  signal?.throwIfAborted();
  if (
    !blob ||
    !latest ||
    latest.lifecycle?.trashedAt !== undefined ||
    (latest.workspaceRevision ?? 0) !== revision
  )
    throw new Error('Background image changed');
  const file = await prepareImage(new File([blob], entry.filename, { type: blob.type }), signal);
  signal?.throwIfAborted();
  if (prepareImage !== prepareBackgroundImage) {
    const preparedEntry = await getMediaLibraryEntry(mediaId);
    signal?.throwIfAborted();
    if (
      !preparedEntry ||
      preparedEntry.lifecycle?.trashedAt !== undefined ||
      (preparedEntry.workspaceRevision ?? 0) !== revision
    )
      throw new Error('Background image changed');
  }
  return { file, originMediaId: entry.id };
}

/** Resource paths come exclusively from the immutable extension manifest. */
export async function readBundledBackground(
  id: string,
  signal?: AbortSignal
): Promise<AcquiredBackground> {
  const item = BUNDLED_BACKGROUNDS.find((item) => item.id === id);
  if (!item) throw new Error('Unknown bundled background');
  const response = await fetch(new URL(item.path, window.location.origin + '/'), {
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error('Bundled background unavailable');
  const blob = await response.blob();
  const type = item.path.endsWith('.svg') ? 'image/svg+xml' : 'image/webp';
  return {
    file: await prepareBackgroundImage(
      new File([blob], item.en + (type === 'image/webp' ? '.webp' : '.svg'), { type }),
      signal
    ),
  };
}

/** Settings upload creates a Library material; subsequent editor selection only inserts it. */
export async function retainBackgroundInLibrary(image: AcquiredBackground): Promise<string> {
  if (image.originMediaId) return image.originMediaId;
  const prepared = await prepareProjectAsset(image.file, image.file.type, image.file.name);
  try {
    await prepared.publish();
  } catch (error) {
    await prepared.cancel();
    throw error;
  }
  const id = `project-asset:${prepared.id}`;
  publishMediaHubLibraryChanged('create', [id]);
  return id;
}
