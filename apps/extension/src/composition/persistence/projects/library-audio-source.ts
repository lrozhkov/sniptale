import { admitsLibrarySourceRef, sameLibrarySourceRef } from './library-source-ref';
import {
  ASSET_REFS_STORE,
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core';
import type { AssetRef } from '../assets/contracts';
import { parseAssetRef } from '../assets/guards';
import type { MediaAssetSource } from '../media-library/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import type { StoredProjectAssetEntry } from './contracts';
import { parseProjectAssetEntry } from './read-guards';

/** A selected immutable object and its logical Library identity, before byte decoding. */
export interface LibraryAudioSource {
  mediaId: string;
  filename: string;
  source: MediaAssetSource;
  ref: AssetRef;
  entry: StoredProjectAssetEntry | null;
}

/** Fixed failure codes for the Library attachment workflow. */
export class LibraryAudioBindingError extends Error {
  constructor(readonly code: 'unavailable' | 'changed-source') {
    super(`Library audio binding ${code}.`);
    this.name = 'LibraryAudioBindingError';
  }
}

/** Reads only metadata; callers serialize admission with the lifecycle owner. */
export async function readLibraryAudioSource(mediaId: string): Promise<LibraryAudioSource> {
  const db = await initDB();
  const tx = db.transaction(
    [MEDIA_LIBRARY_STORE, PROJECT_ASSETS_STORE, STORE_NAME, ASSET_REFS_STORE],
    'readonly'
  );
  try {
    const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
    if (
      !media ||
      media.id !== mediaId ||
      media.kind !== 'audio' ||
      !media.mimeType.startsWith('audio/') ||
      media.lifecycle?.trashedAt !== undefined
    )
      throw new LibraryAudioBindingError('unavailable');
    let entry: StoredProjectAssetEntry | null = null;
    let assetId: string;
    if (media.source.kind === 'stored-asset') assetId = media.source.assetId;
    else if (media.source.kind === 'project-asset') {
      entry = parseProjectAssetEntry(
        await tx.objectStore(PROJECT_ASSETS_STORE).get(media.source.projectAssetId)
      );
      if (!entry || entry.id !== media.source.projectAssetId || entry.originMediaId)
        throw new LibraryAudioBindingError('unavailable');
      assetId = entry.assetId;
    } else if (media.source.kind === 'recording') {
      const recording = parseRecordingEntry(
        await tx.objectStore(STORE_NAME).get(media.source.recordingId)
      );
      if (
        !recording ||
        recording.id !== media.source.recordingId ||
        recording.mimeType !== media.mimeType ||
        recording.size !== media.size
      )
        throw new LibraryAudioBindingError('unavailable');
      assetId = recording.assetId;
    } else throw new LibraryAudioBindingError('unavailable');
    const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(assetId));
    if (!admitsLibrarySourceRef(ref, assetId, media, entry))
      throw new LibraryAudioBindingError('unavailable');
    return { mediaId, filename: media.filename, source: media.source, entry, ref };
  } finally {
    await tx.done;
  }
}

/** Byte identity includes the immutable object's locator and admitted metadata. */
export function sameLibraryAudioRef(left: AssetRef, right: AssetRef): boolean {
  return sameLibrarySourceRef(left, right);
}
