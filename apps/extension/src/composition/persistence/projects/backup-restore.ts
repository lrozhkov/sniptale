import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import type {
  ArchiveRestoreStrategy,
  AssetOwner,
  AssetRef,
  PhysicalDeleteAssetOperation,
} from '../assets';
import type { MediaLibraryEntry, MediaThumbnailEntry } from '../media-library/contracts';
import {
  buildProjectAssetMediaEntry,
  buildProjectExportMediaEntry,
} from '../media-library/entry-mapping';
import type {
  StoredProjectAssetEntry,
  StoredProjectExportEntry,
  VideoProjectEntry,
} from './contracts';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
  parseVideoProjectEntry,
} from './read-guards';
import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_EXPORT_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
} from './asset-publication';

interface Store<T = unknown> {
  delete(key: IDBValidKey): Promise<unknown>;
  get(key: IDBValidKey): Promise<unknown>;
  getAll(): Promise<unknown[]>;
  put(value: T): Promise<unknown>;
}

interface OwnerStore extends Store<AssetOwner> {
  index(name: 'assetId'): { count(assetId: string): Promise<number> };
}

interface IndexStore<T = unknown> extends Store<T> {
  index(name: 'projectId'): { getAll(projectId: string): Promise<unknown[]> };
}

interface PreparedVideoProjectArchiveRoot {
  assets: Array<{ entry: StoredProjectAssetEntry; filename: string; ref: AssetRef }>;
  entry: VideoProjectEntry;
  exports: Array<{
    entry: StoredProjectExportEntry;
    ref: AssetRef;
    thumbnail?: MediaThumbnailEntry;
  }>;
  presentation?: AggregatePresentationEntry;
  thumbnail?: MediaThumbnailEntry;
}

export interface VideoProjectBackupRestoreStores {
  assets: Store<StoredProjectAssetEntry>;
  exports: IndexStore<StoredProjectExportEntry>;
  media: Store<MediaLibraryEntry>;
  operations: Store;
  owners: OwnerStore;
  presentations: Store<AggregatePresentationEntry>;
  projects: Store<VideoProjectEntry>;
  refs: Store<AssetRef>;
  thumbnails: Store<MediaThumbnailEntry>;
}

function projectAssetIds(entry: VideoProjectEntry): Set<string> {
  return new Set(
    entry.project.assets.flatMap((asset) =>
      asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
    )
  );
}

async function unlink(args: {
  assetId: string;
  entityId: string;
  operation: PhysicalDeleteAssetOperation;
  ownerKind: string;
  stores: VideoProjectBackupRestoreStores;
}) {
  await args.stores.owners.delete([args.ownerKind, args.entityId, PROJECT_MEDIA_ASSET_ROLE]);
  if ((await args.stores.owners.index('assetId').count(args.assetId)) === 0) {
    await args.stores.refs.delete(args.assetId);
    args.operation.assetIds.push(args.assetId);
  }
}

async function deleteExisting(args: {
  operation: PhysicalDeleteAssetOperation;
  projectId: string;
  stores: VideoProjectBackupRestoreStores;
}) {
  const existing = parseVideoProjectEntry(await args.stores.projects.get(args.projectId));
  if (!existing) return;
  const protectedAssets = new Set<string>();
  for (const raw of await args.stores.projects.getAll()) {
    const other = parseVideoProjectEntry(raw);
    if (!other || other.id === args.projectId) continue;
    for (const id of projectAssetIds(other)) protectedAssets.add(id);
  }
  for (const id of projectAssetIds(existing)) {
    if (protectedAssets.has(id)) continue;
    const asset = parseProjectAssetEntry(await args.stores.assets.get(id));
    await args.stores.assets.delete(id);
    await args.stores.media.delete(`project-asset:${id}`);
    await args.stores.thumbnails.delete(`project-asset:${id}`);
    if (asset)
      await unlink({
        assetId: asset.assetId,
        entityId: id,
        operation: args.operation,
        ownerKind: PROJECT_ASSET_OWNER_KIND,
        stores: args.stores,
      });
  }
  for (const raw of await args.stores.exports.index('projectId').getAll(args.projectId)) {
    const entry = parseProjectExportEntry(raw);
    if (!entry) continue;
    await args.stores.exports.delete(entry.id);
    await args.stores.media.delete(`export:${entry.id}`);
    await args.stores.thumbnails.delete(`export:${entry.id}`);
    await unlink({
      assetId: entry.assetId,
      entityId: entry.id,
      operation: args.operation,
      ownerKind: PROJECT_EXPORT_OWNER_KIND,
      stores: args.stores,
    });
  }
  await args.stores.thumbnails.delete(`video-project:${args.projectId}`);
  await args.stores.presentations.delete(
    createAggregatePresentationKey({ id: args.projectId, kind: 'video-project' })
  );
  await args.stores.projects.delete(args.projectId);
}

async function collectOtherProjectAssetIds(
  projectId: string,
  stores: VideoProjectBackupRestoreStores
): Promise<Set<string>> {
  const assetIds = new Set<string>();
  for (const raw of await stores.projects.getAll()) {
    const project = parseVideoProjectEntry(raw);
    if (!project || project.id === projectId) continue;
    for (const id of projectAssetIds(project)) assetIds.add(id);
  }
  return assetIds;
}

async function hasAssetConflict(args: {
  existingAssetIds: ReadonlySet<string>;
  otherAssetIds: ReadonlySet<string>;
  root: PreparedVideoProjectArchiveRoot;
  strategy: ArchiveRestoreStrategy;
  stores: VideoProjectBackupRestoreStores;
}): Promise<boolean> {
  let conflicted = false;
  for (const item of args.root.assets) {
    if (!parseProjectAssetEntry(await args.stores.assets.get(item.entry.id))) continue;
    conflicted = true;
    const belongsToRoot =
      args.existingAssetIds.has(item.entry.id) && !args.otherAssetIds.has(item.entry.id);
    if (args.strategy === 'replace' && !belongsToRoot) {
      throw new Error(`Video project asset belongs to another root: ${item.entry.id}.`);
    }
  }
  return conflicted;
}

async function hasExportConflict(args: {
  root: PreparedVideoProjectArchiveRoot;
  strategy: ArchiveRestoreStrategy;
  stores: VideoProjectBackupRestoreStores;
}): Promise<boolean> {
  let conflicted = false;
  for (const item of args.root.exports) {
    const current = parseProjectExportEntry(await args.stores.exports.get(item.entry.id));
    if (!current) continue;
    conflicted = true;
    if (args.strategy === 'replace' && current.projectId !== args.root.entry.id) {
      throw new Error(`Video project export belongs to another root: ${item.entry.id}.`);
    }
  }
  return conflicted;
}

async function publishProjectAssets(
  root: PreparedVideoProjectArchiveRoot,
  stores: VideoProjectBackupRestoreStores
) {
  for (const asset of root.assets) {
    await stores.refs.put(asset.ref);
    await stores.owners.put({
      assetId: asset.ref.assetId,
      ownerId: asset.entry.id,
      ownerKind: PROJECT_ASSET_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await stores.assets.put(asset.entry);
    await stores.media.put({
      ...buildProjectAssetMediaEntry(asset.entry),
      filename: asset.filename,
      originalFilename: asset.filename,
    });
  }
}

async function publishProjectExports(
  root: PreparedVideoProjectArchiveRoot,
  stores: VideoProjectBackupRestoreStores
) {
  for (const item of root.exports) {
    await stores.refs.put(item.ref);
    await stores.owners.put({
      assetId: item.ref.assetId,
      ownerId: item.entry.id,
      ownerKind: PROJECT_EXPORT_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await stores.exports.put(item.entry);
    await stores.media.put(buildProjectExportMediaEntry(item.entry));
    if (item.thumbnail) await stores.thumbnails.put(item.thumbnail);
  }
}

async function publishProjectSidecars(
  root: PreparedVideoProjectArchiveRoot,
  stores: VideoProjectBackupRestoreStores
) {
  if (root.thumbnail) await stores.thumbnails.put(root.thumbnail);
  if (root.presentation) await stores.presentations.put(root.presentation);
}

export async function putVideoProjectBackupRestore(args: {
  operation: PhysicalDeleteAssetOperation;
  root: PreparedVideoProjectArchiveRoot;
  strategy: ArchiveRestoreStrategy;
  stores: VideoProjectBackupRestoreStores;
}): Promise<{ conflicted: boolean; imported: boolean }> {
  const existing = parseVideoProjectEntry(await args.stores.projects.get(args.root.entry.id));
  const existingAssetIds = existing ? projectAssetIds(existing) : new Set<string>();
  const otherAssetIds = await collectOtherProjectAssetIds(args.root.entry.id, args.stores);
  const assetConflict = await hasAssetConflict({
    existingAssetIds,
    otherAssetIds,
    root: args.root,
    stores: args.stores,
    strategy: args.strategy,
  });
  const exportConflict = await hasExportConflict(args);
  const childConflict = assetConflict || exportConflict;
  const conflicted = Boolean(existing || childConflict);
  if (conflicted && args.strategy === 'skip') return { conflicted, imported: false };
  if ((existing || childConflict) && args.strategy === 'duplicate') {
    throw new Error('Video project restore conflict changed after preflight.');
  }
  if (existing && args.strategy === 'replace')
    await deleteExisting({
      operation: args.operation,
      projectId: args.root.entry.id,
      stores: args.stores,
    });
  await args.stores.projects.put(args.root.entry);
  await publishProjectAssets(args.root, args.stores);
  await publishProjectExports(args.root, args.stores);
  await publishProjectSidecars(args.root, args.stores);
  return { conflicted, imported: true };
}
