import type { IDBPTransaction } from 'idb';
import type { AssetRef } from '../assets/contracts';
import { parseAssetOwner, parseAssetRef } from '../assets/guards';
import {
  SupersededAssetPublicationError,
  UnresolvedAssetPublicationError,
} from '../assets/publication';
import {
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core.stores';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseProjectAssetEntry, parseProjectExportEntry } from './read-guards';
import type { StoredProjectAssetEntry } from './contracts';
import type { KnownLibrarySourceClaim } from './asset-publication-payload';
import { sameLibrarySourceRef } from './library-source-ref';

type SourceStore =
  | typeof MEDIA_LIBRARY_STORE
  | typeof PROJECT_ASSETS_STORE
  | typeof PROJECT_EXPORTS_STORE
  | typeof STORE_NAME
  | typeof ASSET_REFS_STORE
  | typeof ASSET_OWNERS_STORE;
export type ReadKnownLibrarySource = (
  store: SourceStore,
  key: string | string[]
) => Promise<unknown>;

/** Fresh source admission uses only the caller's native snapshot; no byte reads or nested TX. */
export async function readKnownLibrarySource(mediaId: string, read: ReadKnownLibrarySource) {
  const raw = await read(MEDIA_LIBRARY_STORE, mediaId);
  if (raw === undefined) throw new SupersededAssetPublicationError();
  const media = parseMediaLibraryEntry(raw);
  if (!media || media.id !== mediaId) throw new UnresolvedAssetPublicationError();
  if (media.lifecycle?.trashedAt !== undefined) throw new SupersededAssetPublicationError();
  const source = media.source;
  let assetId: string;
  if (source.kind === 'recording') {
    const entry = parseRecordingEntry(await read(STORE_NAME, source.recordingId));
    if (!entry || entry.id !== source.recordingId) throw new UnresolvedAssetPublicationError();
    if (entry.mimeType !== media.mimeType || entry.size !== media.size)
      throw new SupersededAssetPublicationError();
    assetId = entry.assetId;
  } else if (source.kind === 'project-export') {
    const entry = parseProjectExportEntry(await read(PROJECT_EXPORTS_STORE, source.exportId));
    if (!entry || entry.id !== source.exportId) throw new UnresolvedAssetPublicationError();
    if (
      entry.projectId !== source.projectId ||
      (entry.mimeType ?? 'video/webm') !== media.mimeType ||
      entry.size !== media.size
    )
      throw new SupersededAssetPublicationError();
    assetId = entry.assetId;
  } else throw new SupersededAssetPublicationError();
  const ref = parseAssetRef(await read(ASSET_REFS_STORE, assetId));
  if (!ref || ref.assetId !== assetId) throw new UnresolvedAssetPublicationError();
  if (ref.mimeType !== media.mimeType || ref.size !== media.size)
    throw new SupersededAssetPublicationError();
  return { mediaId, source, ref, filename: media.filename };
}

/** Exact receipt replay precedes origin lifecycle; ambiguous ownership never authorizes repair. */
export async function admitKnownLibraryPublication(args: {
  claim: KnownLibrarySourceClaim;
  entry: StoredProjectAssetEntry;
  ref: AssetRef;
  read: ReadKnownLibrarySource;
}): Promise<'fresh' | 'replay'> {
  const { claim, entry, ref, read } = args;
  if (
    entry.assetId !== ref.assetId ||
    entry.mimeType !== ref.mimeType ||
    entry.size !== ref.size ||
    entry.originMediaId !== claim.mediaId
  )
    throw new UnresolvedAssetPublicationError();
  const previousRaw = await read(PROJECT_ASSETS_STORE, entry.id);
  const ownerRaw = await read(ASSET_OWNERS_STORE, ['project-asset', entry.id, 'body']);
  const owner = parseAssetOwner(ownerRaw);
  const canonical = parseAssetRef(await read(ASSET_REFS_STORE, ref.assetId));
  if (previousRaw !== undefined) {
    const previous = parseProjectAssetEntry(previousRaw);
    if (!previous || previous.id !== entry.id) throw new UnresolvedAssetPublicationError();
    if (previous.assetId !== entry.assetId) throw new UnresolvedAssetPublicationError();
    if (
      previous.mimeType !== entry.mimeType ||
      previous.size !== entry.size ||
      previous.createdAt !== entry.createdAt ||
      previous.originMediaId !== entry.originMediaId ||
      !owner ||
      owner.assetId !== ref.assetId ||
      owner.ownerId !== entry.id ||
      owner.ownerKind !== 'project-asset' ||
      owner.role !== 'body' ||
      !canonical ||
      !sameLibrarySourceRef(ref, canonical)
    )
      throw new UnresolvedAssetPublicationError();
    return 'replay';
  }
  if (ownerRaw !== undefined) throw new UnresolvedAssetPublicationError();
  const current = await readKnownLibrarySource(claim.mediaId, read);
  const sameLocator =
    current.source.kind === 'recording'
      ? claim.source.kind === 'recording' && current.source.recordingId === claim.source.recordingId
      : claim.source.kind === 'project-export' &&
        current.source.exportId === claim.source.exportId &&
        current.source.projectId === claim.source.projectId;
  if (!sameLocator || !sameLibrarySourceRef(current.ref, ref))
    throw new SupersededAssetPublicationError();
  return 'fresh';
}

/** An in-memory claim on existing bytes, published only with a new destination project. */
export interface LibraryProjectBinding {
  claim: KnownLibrarySourceClaim;
  entry: StoredProjectAssetEntry;
  ref: AssetRef;
}

/** The destination transaction owns admission, publication, and abort for this private binding. */
export async function publishLibraryProjectBindingInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  binding: LibraryProjectBinding
): Promise<void> {
  const { entry, ref, claim } = binding;
  if ((await tx.objectStore(MEDIA_LIBRARY_STORE).get(`project-asset:${entry.id}`)) !== undefined)
    throw new SupersededAssetPublicationError();
  const admission = await admitKnownLibraryPublication({
    entry,
    ref,
    claim,
    read: (store, key) => tx.objectStore(store).get(key),
  });
  if (admission !== 'fresh') throw new SupersededAssetPublicationError();
  await tx.objectStore(ASSET_OWNERS_STORE).put({
    assetId: ref.assetId,
    ownerId: entry.id,
    ownerKind: 'project-asset',
    role: 'body',
  });
  await tx.objectStore(PROJECT_ASSETS_STORE).put(entry);
}
