import { promoteProjectSourceLifecycles } from './new-reference-admission';
import {
  STORE_NAME,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
} from '../infrastructure/indexed-db/core';
import { assertPreparedProjectAssetSources } from './source-admission';
import { assertMediaSourceReplaceable } from './source-admission';
import {
  deleteMediaSidecars,
  releaseMediaSource,
  releaseUnpublishedProjectAssets,
} from '../media-library/delete-cascade.sources';
import type { initDB } from '../infrastructure/indexed-db/core';
import type {
  VideoWorkspace,
  VideoWorkspaceDraft,
  VideoWorkspaceSnapshot,
} from '../review-workspaces/contracts';
import { putVideoReviewRestore } from '../review-workspaces/backup-restore';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import type {
  ArchiveRestoreStrategy,
  AssetOwner,
  AssetRef,
  PhysicalDeleteAssetOperation,
} from '../assets';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
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
import {
  collectProjectAssetOwnership,
  type ProjectAssetOwnership,
} from './backup-restore-asset-ownership';
import { createLibraryLifecycle, promoteLibraryLifecycle } from '../library-lifecycle/contracts';

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
  assets: Array<{
    entry: StoredProjectAssetEntry;
    filename: string;
    publishToLibrary?: boolean;
    reusePublished?: boolean;
    ref: AssetRef;
    videoReview?: VideoWorkspaceSnapshot;
  }>;
  entry: VideoProjectEntry;
  exports: Array<{
    entry: StoredProjectExportEntry;
    ref: AssetRef;
    reusePublished?: boolean;
    thumbnail?: MediaThumbnailEntry;
    videoReview?: VideoWorkspaceSnapshot;
  }>;
  presentation?: AggregatePresentationEntry;
  thumbnail?: MediaThumbnailEntry;
}

export interface VideoProjectBackupRestoreStores {
  assets: Store<StoredProjectAssetEntry>;
  exports: IndexStore<StoredProjectExportEntry>;
  media: Store<MediaLibraryEntry>;
  videoWorkspaces: Store<VideoWorkspace>;
  videoDrafts: Store<VideoWorkspaceDraft>;
  operations: Store;
  owners: OwnerStore;
  presentations: Store<AggregatePresentationEntry>;
  projects: Store<VideoProjectEntry>;
  refs: Store<AssetRef>;
  thumbnails: Store<MediaThumbnailEntry>;
  scenarioAssets: Store;
}

type RestoreTransaction = ReturnType<Awaited<ReturnType<typeof initDB>>['transaction']>;

async function deleteExisting(args: {
  assetOwnership: ProjectAssetOwnership;
  operation: PhysicalDeleteAssetOperation;
  projectId: string;
  root: PreparedVideoProjectArchiveRoot;
  stores: VideoProjectBackupRestoreStores;
  tx: RestoreTransaction;
  releasedCandidates: Set<string>;
}) {
  const existing = parseVideoProjectEntry(await args.stores.projects.get(args.projectId));
  if (!existing) return;
  for (const id of args.assetOwnership.owned) {
    if (args.assetOwnership.protected.has(id)) continue;
    const published: unknown = await args.stores.media.get(`project-asset:${id}`);
    if (
      published !== undefined &&
      !args.root.assets.some(
        (asset) =>
          asset.entry.id === id && asset.publishToLibrary !== false && !asset.reusePublished
      )
    )
      continue;
    if (!args.root.assets.some((asset) => asset.entry.id === id && !asset.reusePublished)) continue;
    const asset = parseProjectAssetEntry(await args.stores.assets.get(id));
    if (!asset || asset.id !== id)
      throw new Error('Existing project source cannot be replaced safely.');
    const children = await deleteMediaSidecars(args.tx, `project-asset:${id}`, args.operation);
    for (const child of children) args.releasedCandidates.add(child);
    await releaseMediaSource(
      args.tx,
      { id: `project-asset:${id}`, source: { kind: 'project-asset', projectAssetId: id } },
      args.operation
    );
  }
  for (const raw of await args.stores.exports.index('projectId').getAll(args.projectId)) {
    const entry = parseProjectExportEntry(raw);
    if (!entry) continue;
    const published: unknown = await args.stores.media.get(`export:${entry.id}`);
    if (
      published !== undefined &&
      !args.root.exports.some((item) => item.entry.id === entry.id && !item.reusePublished)
    )
      continue;
    await assertMediaSourceReplaceable(
      {
        id: `export:${entry.id}`,
        source: { kind: 'project-export', exportId: entry.id, projectId: entry.projectId },
      },
      args.stores,
      args.projectId
    );
    const children = await deleteMediaSidecars(args.tx, `export:${entry.id}`, args.operation);
    for (const child of children) args.releasedCandidates.add(child);
    await releaseMediaSource(
      args.tx,
      {
        id: `export:${entry.id}`,
        source: { kind: 'project-export', exportId: entry.id, projectId: entry.projectId },
      },
      args.operation
    );
  }
  await args.stores.thumbnails.delete(`video-project:${args.projectId}`);
  await args.stores.presentations.delete(
    createAggregatePresentationKey({ id: args.projectId, kind: 'video-project' })
  );
  await args.stores.projects.delete(args.projectId);
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
    if (item.reusePublished) continue;
    const raw: unknown = await args.stores.assets.get(item.entry.id);
    if (raw === undefined) continue;
    const current = parseProjectAssetEntry(raw);
    if (!current || current.id !== item.entry.id)
      throw new Error('Invalid existing project asset cannot be replaced.');
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
    if (!current) {
      if (item.reusePublished)
        throw new Error('Published project export changed after preparation.');
      continue;
    }
    if (item.reusePublished) {
      if (
        current.id !== item.entry.id ||
        current.assetId !== item.entry.assetId ||
        current.size !== item.entry.size ||
        current.mimeType !== item.entry.mimeType
      )
        throw new Error('Published project export changed after preparation.');
      await readPublishedExport(args.stores.media, item.entry.id, current.projectId);
      continue;
    }
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
    if (asset.reusePublished) continue;
    await stores.refs.put(asset.ref);
    await stores.owners.put({
      assetId: asset.ref.assetId,
      ownerId: asset.entry.id,
      ownerKind: PROJECT_ASSET_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await stores.assets.put(asset.entry);
    if (asset.videoReview)
      await putVideoReviewRestore({
        review: asset.videoReview,
        workspaces: stores.videoWorkspaces,
        drafts: stores.videoDrafts,
      });
    if (asset.publishToLibrary !== false) {
      await stores.media.put({
        ...buildProjectAssetMediaEntry(asset.entry),
        filename: asset.filename,
        originalFilename: asset.filename,
      });
    }
  }
}

async function publishProjectExports(
  root: PreparedVideoProjectArchiveRoot,
  stores: VideoProjectBackupRestoreStores
) {
  for (const item of root.exports) {
    if (item.reusePublished) {
      const media = await readPublishedExport(stores.media, item.entry.id);
      await stores.exports.put(item.entry);
      await stores.media.put({
        ...media,
        source: { ...media.source, projectId: item.entry.projectId },
      });
      continue;
    }
    await stores.refs.put(item.ref);
    await stores.owners.put({
      assetId: item.ref.assetId,
      ownerId: item.entry.id,
      ownerKind: PROJECT_EXPORT_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await stores.exports.put(item.entry);
    if (item.videoReview)
      await putVideoReviewRestore({
        review: item.videoReview,
        workspaces: stores.videoWorkspaces,
        drafts: stores.videoDrafts,
      });
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
  tx: RestoreTransaction;
}): Promise<{ conflicted: boolean; imported: boolean }> {
  await assertPreparedProjectAssetSources(args.root.assets, args.stores);
  const existing = parseVideoProjectEntry(await args.stores.projects.get(args.root.entry.id));
  const assetOwnership = await collectProjectAssetOwnership({
    existing,
    projectId: args.root.entry.id,
    stores: args.stores,
  });
  const assetConflict = await hasAssetConflict({
    existingAssetIds: assetOwnership.owned,
    otherAssetIds: assetOwnership.protected,
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
  const releasedCandidates = new Set(assetOwnership.owned);
  if (existing && args.strategy === 'replace')
    await deleteExisting({
      assetOwnership,
      root: args.root,
      operation: args.operation,
      projectId: args.root.entry.id,
      stores: args.stores,
      tx: args.tx,
      releasedCandidates,
    });
  const lifecycle =
    args.root.entry.lifecycle ?? createLibraryLifecycle('library', args.root.entry.updatedAt);
  await args.stores.projects.put({
    ...args.root.entry,
    lifecycle: promoteLibraryLifecycle(lifecycle, lifecycle.updatedAt),
  });
  await publishProjectAssets(args.root, args.stores);
  await publishProjectExports(args.root, args.stores);
  await publishProjectSidecars(args.root, args.stores);
  await promoteProjectSourceLifecycles(
    args.root.entry.project,
    {
      mediaLibraryStore: args.tx.objectStore(MEDIA_LIBRARY_STORE),
      projectAssetStore: args.tx.objectStore(PROJECT_ASSETS_STORE),
      scenarioAssetStore: args.tx.objectStore(SCENARIO_ASSETS_STORE),
      recordingStore: args.tx.objectStore(STORE_NAME),
    },
    Date.now()
  );
  await releaseUnpublishedProjectAssets(args.tx, releasedCandidates, args.operation);
  return { conflicted, imported: true };
}

async function readPublishedExport(
  store: VideoProjectBackupRestoreStores['media'],
  id: string,
  projectId?: string
) {
  const media = parseMediaLibraryEntry(await store.get(`export:${id}`));
  if (
    !media ||
    media.id !== `export:${id}` ||
    media.source.kind !== 'project-export' ||
    media.source.exportId !== id ||
    (projectId !== undefined && media.source.projectId !== projectId)
  )
    throw new Error('Published project export identity changed after preparation.');
  return { ...media, source: media.source };
}
