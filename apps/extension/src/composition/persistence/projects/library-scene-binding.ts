import { createLibraryBinding, libraryBindingPayload } from './library-binding';
import {
  initDB,
  PROJECT_ASSETS_STORE,
  MEDIA_LIBRARY_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { readAssetFile } from '../assets/opfs-store';
import { createAssetPublicationJournal } from '../assets/publication';
import type { ProjectAssetPublicationPayload } from './asset-publication-payload';
import {
  LibrarySceneBindingError,
  readLibrarySceneSource,
  sameLibrarySceneRef,
  type LibrarySceneSource,
} from './library-scene-source';

export { LibrarySceneBindingError } from './library-scene-source';

/** A read-only source snapshot; decoding this file never imports it again. */
interface LibrarySceneBindingSource extends LibrarySceneSource {
  file: File;
}

/** Resolves one selected Library source, preserving its real Library filename. */
export async function readLibrarySceneBindingSource(
  mediaId: string,
  kind: 'image' | 'video'
): Promise<LibrarySceneBindingSource> {
  const source = await readLibrarySceneSource(mediaId, kind);
  try {
    return { ...source, file: await readAssetFile(source.ref, source.filename) };
  } catch {
    throw new LibrarySceneBindingError('unavailable');
  }
}

/** A claim on existing bytes; cancellation must follow proof that attachment did not commit. */
interface PreparedLibrarySceneBinding {
  assetId: string;
  publish(): Promise<void>;
  cancel(): Promise<void>;
}

/**
 * Caller holds the project-asset attachment lock across preparation, durable attach and
 * publication. The ready claim shares existing bytes and never publishes another card.
 */
export async function prepareLibrarySceneBinding(
  source: LibrarySceneSource,
  requiredReview: { aggregateId: string; slot: 'intro' | 'outro'; kind: 'image' | 'video' },
  projectAssetId: string
): Promise<PreparedLibrarySceneBinding> {
  if (
    !requiredReview.aggregateId ||
    !projectAssetId ||
    (requiredReview.slot !== 'intro' && requiredReview.slot !== 'outro') ||
    (requiredReview.kind !== 'image' && requiredReview.kind !== 'video')
  )
    throw new LibrarySceneBindingError('unavailable');
  const db = await initDB();
  const journal = await runWithDurableAssetLifecycleLock(async (lifecyclePermit) => {
    const current = await readLibrarySceneSource(source.mediaId, requiredReview.kind);
    if (
      !sameLibrarySceneRef(source.ref, current.ref) ||
      JSON.stringify(source.source) !== JSON.stringify(current.source) ||
      (current.entry && current.entry.id !== projectAssetId)
    )
      throw new LibrarySceneBindingError('changed-source');
    if (
      !current.entry &&
      ((await db.get(PROJECT_ASSETS_STORE, projectAssetId)) !== undefined ||
        (await db.get(MEDIA_LIBRARY_STORE, `project-asset:${projectAssetId}`)) !== undefined)
    )
      throw new LibrarySceneBindingError('changed-source');
    try {
      await readAssetFile(current.ref, current.filename);
    } catch {
      throw new LibrarySceneBindingError('unavailable');
    }
    return createAssetPublicationJournal<ProjectAssetPublicationPayload>({
      domain: 'project-assets',
      assetRefs: [current.ref],
      lifecyclePermit,
      payload: {
        ...libraryBindingPayload(current, projectAssetId),
        requiredReviewResource: { ...requiredReview, acquisition: 'library-binding' },
      },
    });
  });
  return createLibraryBinding(journal, projectAssetId);
}

/** One protected claim owns its publication retry state. */
