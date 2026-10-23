import {
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  STORE_NAME,
  ASSET_REFS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithDurableAssetLifecycleLock } from '../infrastructure/mutation-barrier';
import { createAssetPublicationJournal } from '../assets/publication';
import { readAssetFile } from '../assets/opfs-store';
import { type LibraryProjectBinding, readKnownLibrarySource } from './known-library-source';
import { sameLibrarySourceRef } from './library-source-ref';
import { createLibraryBinding } from './library-binding';
import type { ProjectAssetPublicationPayload } from './asset-publication-payload';

async function snapshot(mediaId: string) {
  const db = await initDB();
  const tx = db.transaction(
    [
      MEDIA_LIBRARY_STORE,
      PROJECT_ASSETS_STORE,
      PROJECT_EXPORTS_STORE,
      STORE_NAME,
      ASSET_REFS_STORE,
    ],
    'readonly'
  );
  try {
    return await readKnownLibrarySource(mediaId, (store, key) => tx.objectStore(store).get(key));
  } finally {
    await tx.done;
  }
}

/** Acquires immutable source bytes for metadata decoding outside a native transaction. */
export async function readLibraryProjectBindingSource(mediaId: string) {
  const source = await snapshot(mediaId);
  return { ...source, file: await readAssetFile(source.ref, source.filename) };
}

/** Creates only a ready reference claim; accepted publication adds a new logical body owner. */
export async function prepareLibraryProjectBinding(
  source: Awaited<ReturnType<typeof readLibraryProjectBindingSource>>,
  projectAssetId: string
) {
  await initDB();
  const journal = await runWithDurableAssetLifecycleLock(async (lifecyclePermit) => {
    const current = await snapshot(source.mediaId);
    if (
      !sameLibrarySourceRef(current.ref, source.ref) ||
      JSON.stringify(current.source) !== JSON.stringify(source.source)
    )
      throw new Error('The selected Library source changed.');
    await readAssetFile(current.ref, current.filename);
    return createAssetPublicationJournal<ProjectAssetPublicationPayload>({
      domain: 'project-assets',
      assetRefs: [current.ref],
      lifecyclePermit,
      payload: {
        entry: {
          id: projectAssetId,
          assetId: current.ref.assetId,
          mimeType: current.ref.mimeType,
          size: current.ref.size,
          createdAt: Date.now(),
          originMediaId: current.mediaId,
        },
        filename: current.filename,
        expectedAssetId: null,
        publishToLibrary: false,
        expectedLibrarySource: { mediaId: current.mediaId, source: current.source },
      },
    });
  });
  return createLibraryBinding(journal, projectAssetId);
}

/** Keeps acquisition disposable until the destination transaction accepts the exact source. */
export function prepareLibraryProjectBindingForCommit(
  source: Awaited<ReturnType<typeof readLibraryProjectBindingSource>>,
  projectAssetId: string
): LibraryProjectBinding {
  return {
    claim: { mediaId: source.mediaId, source: source.source },
    ref: source.ref,
    entry: {
      id: projectAssetId,
      assetId: source.ref.assetId,
      mimeType: source.ref.mimeType,
      size: source.ref.size,
      createdAt: Date.now(),
      originMediaId: source.mediaId,
    },
  };
}
