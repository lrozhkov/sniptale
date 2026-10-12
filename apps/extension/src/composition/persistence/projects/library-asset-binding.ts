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

/** Read-only re-admission for an unaccepted prepared receipt; caller holds its attachment lock. */
export async function assertLibraryAudioBindingSource(
  source: LibraryAudioSource,
  projectAssetId: string
): Promise<void> {
  const db = await initDB();
  await runWithDurableAssetLifecycleLock(async () => {
    await admitLibraryAudioBindingSource(source, projectAssetId, db);
  });
}

/** Preparation and receipt reuse share one canonical source/ref/bytes admission. */
async function admitLibraryAudioBindingSource(
  source: LibraryAudioSource,
  projectAssetId: string,
  db: Awaited<ReturnType<typeof initDB>>
) {
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
  return current;
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
    const current = await admitLibraryAudioBindingSource(source, projectAssetId, db);
    return createAssetPublicationJournal<ProjectAssetPublicationPayload>({
      domain: 'project-assets',
      assetRefs: [current.ref],
      lifecyclePermit,
      payload: {
        ...libraryBindingPayload(current, projectAssetId),
        requiredReview,
      },
    });
  });
  return createLibraryBinding(journal, projectAssetId);
}
