import { prepareBackgroundImage } from '../background-images/intake';
import { prepareProjectAsset } from '../../composition/persistence/projects';
import { publishMediaHubLibraryChanged } from '../../features/media-hub/events';

/** Validates a raster, then attaches its staged bytes through the review history owner. */
export async function importReviewBackgroundImage(args: {
  file: File;
  originMediaId?: string;
  signal: AbortSignal;
  attach(assetId: string): Promise<void>;
}): Promise<void> {
  const { signal } = args;
  const file = await prepareBackgroundImage(args.file, signal);
  const prepared = await prepareProjectAsset(
    file,
    file.type,
    file.name,
    undefined,
    undefined,
    undefined,
    args.originMediaId ? { publishToLibrary: false, originMediaId: args.originMediaId } : {}
  );
  let attached = false;
  try {
    signal.throwIfAborted();
    await prepared.protect();
    signal.throwIfAborted();
    await args.attach(`project-asset:${prepared.id}`);
    attached = true;
    await prepared.publish();
    if (!args.originMediaId)
      publishMediaHubLibraryChanged('create', [`project-asset:${prepared.id}`]);
  } finally {
    // Once referenced, a failed publication retains the existing recovery journal.
    if (!attached) await prepared.cancel();
  }
}
