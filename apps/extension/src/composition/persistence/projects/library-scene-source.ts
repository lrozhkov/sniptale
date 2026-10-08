import {
  ASSET_REFS_STORE,
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core';
import type { AssetRef } from '../assets/contracts';
import { parseAssetRef } from '../assets/guards';
import type { MediaAssetSource, MediaLibraryEntry } from '../media-library/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import type { StoredProjectAssetEntry } from './contracts';
import { parseProjectAssetEntry, parseProjectExportEntry } from './read-guards';

/** A selected immutable object and its logical Library identity, before byte decoding. */
export interface LibrarySceneSource {
  mediaId: string;
  filename: string;
  source: MediaAssetSource;
  ref: AssetRef;
  entry: StoredProjectAssetEntry | null;
}

/** Fixed failure codes for the Library attachment workflow. */
export class LibrarySceneBindingError extends Error {
  constructor(readonly code: 'unavailable' | 'changed-source') {
    super(`Library scene binding ${code}.`);
    this.name = 'LibrarySceneBindingError';
  }
}

/** Resolves each supported Library locator without opening another transaction. */
async function sceneLocator(
  media: MediaLibraryEntry,
  read: (
    store: typeof PROJECT_ASSETS_STORE | typeof PROJECT_EXPORTS_STORE | typeof STORE_NAME,
    id: string
  ) => Promise<unknown>
) {
  let entry: StoredProjectAssetEntry | null = null;
  let assetId: string;
  if (media.source.kind === 'stored-asset') assetId = media.source.assetId;
  else if (media.source.kind === 'project-asset') {
    entry = parseProjectAssetEntry(await read(PROJECT_ASSETS_STORE, media.source.projectAssetId));
    if (!entry || entry.id !== media.source.projectAssetId || entry.originMediaId)
      throw new LibrarySceneBindingError('unavailable');
    assetId = entry.assetId;
  } else if (media.source.kind === 'recording') {
    const recording = parseRecordingEntry(await read(STORE_NAME, media.source.recordingId));
    if (
      !recording ||
      recording.id !== media.source.recordingId ||
      recording.mimeType !== media.mimeType ||
      recording.size !== media.size
    )
      throw new LibrarySceneBindingError('unavailable');
    assetId = recording.assetId;
  } else if (media.source.kind === 'project-export') {
    const exported = parseProjectExportEntry(
      await read(PROJECT_EXPORTS_STORE, media.source.exportId)
    );
    if (
      !exported ||
      exported.id !== media.source.exportId ||
      exported.projectId !== media.source.projectId ||
      exported.mimeType !== media.mimeType ||
      exported.size !== media.size
    )
      throw new LibrarySceneBindingError('unavailable');
    assetId = exported.assetId;
  } else throw new LibrarySceneBindingError('unavailable');
  return { entry, assetId };
}

/** Reads only metadata; callers serialize admission with the lifecycle owner. */
export async function readLibrarySceneSource(
  mediaId: string,
  kind: 'image' | 'video'
): Promise<LibrarySceneSource> {
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
    const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
    if (
      !media ||
      media.id !== mediaId ||
      media.kind !== kind ||
      !media.mimeType.startsWith(`${kind}/`) ||
      media.lifecycle?.trashedAt !== undefined
    )
      throw new LibrarySceneBindingError('unavailable');
    const { entry, assetId } = await sceneLocator(media, (store, id) =>
      tx.objectStore(store).get(id)
    );
    const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(assetId));
    if (
      !ref ||
      ref.assetId !== assetId ||
      ref.size !== media.size ||
      ref.mimeType !== media.mimeType ||
      (entry && (entry.size !== ref.size || entry.mimeType !== ref.mimeType))
    )
      throw new LibrarySceneBindingError('unavailable');
    return { mediaId, filename: media.filename, source: media.source, entry, ref };
  } finally {
    await tx.done;
  }
}

/** Byte identity includes the immutable object's locator and admitted metadata. */
export function sameLibrarySceneRef(left: AssetRef, right: AssetRef): boolean {
  return (
    left.assetId === right.assetId &&
    left.location.kind === right.location.kind &&
    left.location.objectKey === right.location.objectKey &&
    left.size === right.size &&
    left.mimeType === right.mimeType &&
    left.sha256 === right.sha256 &&
    left.createdAt === right.createdAt
  );
}
