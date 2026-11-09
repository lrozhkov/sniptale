import { readAssetFile } from '../assets/opfs-store';
import type { MediaThumbnailEntry } from '../media-library/contracts';
import { parseMediaThumbnailEntry } from '../media-library/read-guards';
import { verifyReviewAnnotationEffectSnapshot } from '../../../features/video/review/annotation-effects/validation';
import {
  parsePreparedVideoReviewReplicaRoot,
  type PreparedVideoReviewReplicaRoot,
} from './prepared-review-parser';
export {
  parsePreparedVideoReviewReplicaRoot,
  collectPreparedVideoReviewReplicaRefs,
} from './prepared-review-parser';
export type { PreparedVideoReviewReplicaRoot } from './prepared-review-parser';

function invalid(): never {
  throw new Error('Prepared video review metadata or resource closure is invalid.');
}

/** Validate effect file integrity and detach thumbnail bytes before the publication transaction. */
export async function hydratePreparedVideoReviewReplicaRoot(input: PreparedVideoReviewReplicaRoot) {
  const root = parsePreparedVideoReviewReplicaRoot(input);
  const byReference = new Map(
    root.assets.map((asset) => [`project-asset:${asset.entry.id}`, asset])
  );
  const files = new Map<string, Promise<Blob>>();
  const read = async (reference: string) => {
    const asset = byReference.get(reference);
    if (!asset) return undefined;
    let file = files.get(reference);
    if (!file) {
      file = readAssetFile(asset.ref, asset.filename);
      files.set(reference, file);
    }
    return file;
  };
  const signal = new AbortController().signal;
  for (const snapshot of [
    root.review,
    ...root.assets.flatMap((asset) => (asset.videoReview ? [asset.videoReview] : [])),
  ])
    for (const effect of snapshot.workspace.effectSnapshots ?? [])
      await verifyReviewAnnotationEffectSnapshot(effect, read, signal);
  let hydrated: MediaThumbnailEntry | undefined;
  if (root.thumbnail) {
    const file = await readAssetFile(root.thumbnail.ref, 'thumbnail');
    if (file.size !== root.thumbnail.ref.size || file.type !== root.thumbnail.ref.mimeType)
      invalid();
    hydrated =
      parseMediaThumbnailEntry({
        ...root.thumbnail.entry,
        blob: new Blob([await file.arrayBuffer()], { type: file.type }),
      }) ?? invalid();
  }
  return {
    review: root.review,
    sourceMediaId: root.sourceMediaId,
    assets: root.assets,
    ...(hydrated ? { thumbnail: hydrated } : {}),
  };
}
