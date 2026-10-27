import type { AssetOwner, AssetRef } from '../assets/contracts';
import type { StoredProjectAssetEntry, StoredProjectExportEntry } from '../projects/contracts';
import type { MediaLibraryEntry } from './contracts';

export interface PreparedMediaSourcePublication {
  media: MediaLibraryEntry;
  original: { ref: AssetRef };
  projectAsset?: StoredProjectAssetEntry | null;
  projectExport?: StoredProjectExportEntry | null;
}

interface PublicationStore<T> {
  put(value: T): Promise<unknown>;
}

interface MediaSourcePublicationStores {
  media: PublicationStore<MediaLibraryEntry>;
  refs: PublicationStore<AssetRef>;
  owners: PublicationStore<AssetOwner>;
  projectAssets: PublicationStore<StoredProjectAssetEntry>;
  projectExports: PublicationStore<StoredProjectExportEntry>;
}

/** Publish accepted Library source rows inside the caller's transaction. */
export async function publishPreparedMediaSourceInTransaction(
  prepared: PreparedMediaSourcePublication,
  stores: MediaSourcePublicationStores
): Promise<void> {
  await stores.media.put(prepared.media);
  if (prepared.media.source.kind !== 'stored-asset') return;
  await stores.refs.put(prepared.original.ref);
  await stores.owners.put({
    assetId: prepared.original.ref.assetId,
    ownerId: prepared.media.id,
    ownerKind: 'media-library',
    role: 'source',
  });
}

/** Publish the source child after the caller's intervening thumbnail phase. */
export async function publishPreparedMediaProjectChildInTransaction(
  prepared: PreparedMediaSourcePublication,
  stores: MediaSourcePublicationStores
): Promise<void> {
  const child = prepared.projectAsset ?? prepared.projectExport;
  if (!child) return;
  await stores.refs.put(prepared.original.ref);
  await stores.owners.put({
    assetId: child.assetId,
    ownerId: child.id,
    ownerKind: prepared.projectAsset ? 'project-asset' : 'project-export',
    role: 'body',
  });
  if (prepared.projectAsset) await stores.projectAssets.put(prepared.projectAsset);
  else if (prepared.projectExport) await stores.projectExports.put(prepared.projectExport);
}
