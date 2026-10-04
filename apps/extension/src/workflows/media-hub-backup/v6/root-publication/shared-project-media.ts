import {
  parseAssetRef,
  readAssetFile,
  type AssetRef,
} from '../../../../composition/persistence/assets';
import {
  initDB,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  ASSET_REFS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { parseMediaLibraryEntry } from '../../../../composition/persistence/media-library/read-guards';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
} from '../../../../composition/persistence/projects/read-guards';

export function restoredProjectMediaId(
  sourceId: string,
  roots: Readonly<Record<string, string>>,
  prefix: 'project-asset:' | 'export:'
): string {
  const mediaId = roots[`media:library-item:${sourceId}`];
  if (!mediaId?.startsWith(prefix) || mediaId.length === prefix.length)
    throw new Error('Restored published project media identity is unresolved.');
  return mediaId.slice(prefix.length);
}

/** Verify bytes only after an explicit archived identity has been resolved; never infer identity from content. */
export async function assertMatchingArchiveAsset(
  staged: AssetRef,
  shared: AssetRef,
  message = 'Restored published project source differs from the archive.'
): Promise<void> {
  if (staged.mimeType !== shared.mimeType || staged.size !== shared.size) throw new Error(message);
  const [stagedFile, sharedFile] = await Promise.all([
    readAssetFile(staged, 'archive-source'),
    readAssetFile(shared, 'published-source'),
  ]);
  if (stagedFile.size !== staged.size || sharedFile.size !== shared.size) throw new Error(message);
  const chunkSize = 1024 * 1024;
  for (let offset = 0; offset < stagedFile.size; offset += chunkSize) {
    const [a, b] = await Promise.all([
      stagedFile.slice(offset, offset + chunkSize).arrayBuffer(),
      sharedFile.slice(offset, offset + chunkSize).arrayBuffer(),
    ]);
    const left = new Uint8Array(a);
    const right = new Uint8Array(b);
    if (left.length !== right.length || left.some((byte, index) => byte !== right[index]))
      throw new Error(message);
  }
}

async function readPublishedMedia(sourceId: string, roots: Readonly<Record<string, string>>) {
  const mediaId = roots[`media:library-item:${sourceId}`];
  if (!mediaId) throw new Error('Restored published project media identity is unresolved.');
  const db = await initDB();
  const media = parseMediaLibraryEntry(await db.get(MEDIA_LIBRARY_STORE, mediaId));
  if (!media || media.id !== mediaId)
    throw new Error('Restored published project media is unavailable.');
  return { db, media };
}

async function readSharedRef(
  db: Awaited<ReturnType<typeof initDB>>,
  assetId: string,
  staged: AssetRef
) {
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, assetId));
  if (!ref || ref.assetId !== assetId)
    throw new Error('Restored published project bytes are unavailable.');
  await assertMatchingArchiveAsset(staged, ref);
  return ref;
}

export async function readSharedProjectAsset(
  sourceId: string,
  roots: Readonly<Record<string, string>>,
  staged: AssetRef
) {
  const { db, media } = await readPublishedMedia(sourceId, roots);
  const id = restoredProjectMediaId(sourceId, roots, 'project-asset:');
  if (media.source.kind !== 'project-asset' || media.source.projectAssetId !== id)
    throw new Error('Restored published project asset association is invalid.');
  const entry = parseProjectAssetEntry(await db.get(PROJECT_ASSETS_STORE, id));
  if (!entry || entry.id !== id || entry.mimeType !== staged.mimeType || entry.size !== staged.size)
    throw new Error('Restored published project asset is unavailable.');
  const ref = await readSharedRef(db, entry.assetId, staged);
  return { entry, ref, mediaId: media.id };
}

export async function readSharedProjectExport(
  sourceId: string,
  roots: Readonly<Record<string, string>>,
  staged: AssetRef
) {
  const { db, media } = await readPublishedMedia(sourceId, roots);
  const id = restoredProjectMediaId(sourceId, roots, 'export:');
  if (media.source.kind !== 'project-export' || media.source.exportId !== id)
    throw new Error('Restored published project export association is invalid.');
  const entry = parseProjectExportEntry(await db.get(PROJECT_EXPORTS_STORE, id));
  if (
    !entry ||
    entry.id !== id ||
    entry.projectId !== media.source.projectId ||
    (entry.mimeType ?? 'video/webm') !== staged.mimeType ||
    entry.size !== staged.size
  )
    throw new Error('Restored published project export is unavailable.');
  const ref = await readSharedRef(db, entry.assetId, staged);
  return { entry, ref, mediaId: media.id };
}

export function restoredOriginMediaId(
  origin: string | undefined,
  roots: Readonly<Record<string, string>>
): { originMediaId?: string } {
  if (!origin) return {};
  const id = roots[`media:library-item:${origin}`];
  if (!id) throw new Error('Restored private project source identity is unresolved.');
  return { originMediaId: id };
}
