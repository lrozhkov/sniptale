import { prepareProjectAsset } from '../../composition/persistence/projects';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';

/** Validates a raster, then attaches its staged bytes through the review history owner. */
export async function importReviewBackgroundImage(args: {
  file: File;
  signal: AbortSignal;
  attach(assetId: string): Promise<void>;
}): Promise<void> {
  const { file, signal } = args;
  if (
    !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
    !file.size ||
    file.size > 16 * 1024 * 1024
  )
    throw new Error('Unsupported background image.');
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 40_000_000)
      throw new Error('Unsupported background dimensions.');
  } finally {
    bitmap.close();
  }
  signal.throwIfAborted();
  const prepared = await prepareProjectAsset(file, file.type, file.name);
  let attached = false;
  try {
    signal.throwIfAborted();
    await args.attach(`project-asset:${prepared.id}`);
    attached = true;
    await prepared.publish();
    publishMediaHubLibraryChanged('create', [`project-asset:${prepared.id}`]);
  } finally {
    // Once referenced, a failed publication retains the existing recovery journal.
    if (!attached) await prepared.discard();
  }
}
