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
  LibraryAudioBindingError,
  readLibraryAudioSource,
  sameLibraryAudioRef,
  type LibraryAudioSource,
} from './library-audio-source';

export { LibraryAudioBindingError } from './library-audio-source';

/** A read-only source snapshot; decoding this file never imports it again. */
interface LibraryAudioBindingSource extends LibraryAudioSource {
  file: File;
}

/** Resolves one selected Library source, preserving its real Library filename. */
export async function readLibraryAudioBindingSource(
  mediaId: string
): Promise<LibraryAudioBindingSource> {
  const source = await readLibraryAudioSource(mediaId);
  try {
    return { ...source, file: await readAssetFile(source.ref, source.filename) };
  } catch {
    throw new LibraryAudioBindingError('unavailable');
  }
}

/** A claim on existing bytes; cancellation must follow proof that attachment did not commit. */
interface PreparedLibraryAudioBinding {
  assetId: string;
  publish(): Promise<void>;
  cancel(): Promise<void>;
}

/**
 * Caller holds the project-asset attachment lock across preparation, durable attach and
 * publication. The ready claim shares existing bytes and never publishes another card.
 */
export async function prepareLibraryAudioBinding(
  source: LibraryAudioSource,
  requiredReview: { aggregateId: string; clipId: string },
  projectAssetId: string
): Promise<PreparedLibraryAudioBinding> {
  const db = await initDB();
  const journal = await runWithDurableAssetLifecycleLock(async (lifecyclePermit) => {
    const current = await readLibraryAudioSource(source.mediaId);
    if (
      !sameLibraryAudioRef(source.ref, current.ref) ||
      JSON.stringify(source.source) !== JSON.stringify(current.source) ||
      (current.entry && current.entry.id !== projectAssetId)
    )
      throw new LibraryAudioBindingError('changed-source');
    if (
      !current.entry &&
      ((await db.get(PROJECT_ASSETS_STORE, projectAssetId)) !== undefined ||
        (await db.get(MEDIA_LIBRARY_STORE, `project-asset:${projectAssetId}`)) !== undefined)
    )
      throw new LibraryAudioBindingError('changed-source');
    try {
      await readAssetFile(current.ref, current.filename);
    } catch {
      throw new LibraryAudioBindingError('unavailable');
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
        requiredReview,
        ...(!current.entry ? { publishToLibrary: false } : {}),
      },
    });
  });
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
