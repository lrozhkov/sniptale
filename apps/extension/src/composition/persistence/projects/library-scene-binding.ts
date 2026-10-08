import type { AssetReadyJournal } from '../assets/contracts';
import {
  initDB,
  PROJECT_ASSETS_STORE,
  MEDIA_LIBRARY_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { readAssetFile } from '../assets/opfs-store';
import {
  cancelAssetPublication,
  createAssetPublicationJournal,
  publishReadyJournalWithRetry,
} from '../assets/publication';
import { publishProjectAssetJournal } from './asset-publication';
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
    const entry = current.entry ?? {
      id: projectAssetId,
      assetId: current.ref.assetId,
      mimeType: current.ref.mimeType,
      size: current.ref.size,
      createdAt: Date.now(),
      originMediaId: current.mediaId,
    };
    return createAssetPublicationJournal<ProjectAssetPublicationPayload>({
      domain: 'project-assets',
      assetRefs: [current.ref],
      lifecyclePermit,
      payload: {
        entry,
        filename: current.filename,
        expectedAssetId: current.entry?.assetId ?? null,
        librarySourceId: current.mediaId,
        requiredReviewResource: { ...requiredReview, acquisition: 'library-binding' },
        ...(!current.entry ? { publishToLibrary: false } : {}),
      },
    });
  });
  return createBinding(journal, projectAssetId);
}

/** One protected claim owns its publication retry state. */
function createBinding(
  journal: AssetReadyJournal<ProjectAssetPublicationPayload>,
  projectAssetId: string
): PreparedLibrarySceneBinding {
  let published = false;
  let publishing: Promise<void> | null = null;
  return {
    assetId: `project-asset:${projectAssetId}`,
    async publish() {
      if (published) return;
      if (publishing) return publishing;
      publishing = publishReadyJournalWithRetry(journal, publishProjectAssetJournal);
      try {
        await publishing;
        published = true;
      } finally {
        publishing = null;
      }
    },
    async cancel() {
      if (!published) await cancelAssetPublication(journal);
    },
  };
}
