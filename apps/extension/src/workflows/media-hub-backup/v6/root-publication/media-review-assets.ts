import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
} from '../../../../composition/persistence/projects/asset-publication';
import type { ProjectAssetEntry } from '../../../../composition/persistence/projects/contracts';
import {
  parseProjectAssetEntry,
  parseVideoProjectEntry,
} from '../../../../composition/persistence/projects/read-guards';
import { prepareVideoReviewRestore } from '../../../../composition/persistence/review-workspaces/backup-restore';
import { collectReviewAssetReferences } from '../../../../composition/persistence/review-workspaces/asset-refs';
import { parseVideoWorkspace } from '../../../../composition/persistence/review-workspaces/parser';
import type {
  AssetRef,
  PhysicalDeleteAssetOperation,
} from '../../../../composition/persistence/assets';
import { buildProjectAssetMediaEntry } from '../../../../composition/persistence/media-library/entry-mapping';
import type { PortableMediaMetadata } from '../root-codecs/media';
import type { StagedArchiveObject } from '../staging';

type MutableStore = {
  get(key: IDBValidKey): Promise<unknown>;
  put(value: unknown): Promise<unknown>;
};

interface DeleteStore {
  delete(key: IDBValidKey): Promise<unknown>;
}

interface ReviewWorkspaceRetentionStore extends DeleteStore {
  get(key: IDBValidKey): Promise<unknown>;
  getAll(): Promise<unknown[]>;
}

interface MediaReviewAssetRetentionStores {
  media: DeleteStore;
  owners: DeleteStore & {
    index(name: 'assetId'): { count(assetId: string): Promise<number> };
  };
  projectAssets: DeleteStore & Pick<MutableStore, 'get'>;
  refs: DeleteStore;
  thumbnails: DeleteStore;
  videoDrafts: DeleteStore;
  videoProjects: { getAll(): Promise<unknown[]> };
  videoWorkspaces: ReviewWorkspaceRetentionStore;
}

interface PreparedMediaReviewAsset {
  entry: ProjectAssetEntry;
  filename: string;
  ref: AssetRef;
  sourceId: string;
}

interface MediaReviewAssetStores {
  media: Pick<MutableStore, 'put'>;
  owners: Pick<MutableStore, 'put'>;
  projectAssets: MutableStore;
  refs: Pick<MutableStore, 'put'>;
}

const PROJECT_ASSET_PREFIX = 'project-asset:';

function addReviewAssetIds(
  workspace: Parameters<typeof collectReviewAssetReferences>[0],
  into: Set<string>
): void {
  for (const reference of collectReviewAssetReferences(workspace)) {
    into.add(reference.slice(PROJECT_ASSET_PREFIX.length));
  }
}

async function collectDirectProjectAssetIds(
  videoProjects: MediaReviewAssetRetentionStores['videoProjects']
): Promise<Set<string>> {
  const assetIds = new Set<string>();
  for (const raw of await videoProjects.getAll()) {
    const entry = parseVideoProjectEntry(raw);
    if (!entry) continue;
    for (const asset of entry.project.assets) {
      if (asset.source.kind === 'project-asset') assetIds.add(asset.source.projectAssetId);
    }
  }
  return assetIds;
}

async function addOtherWorkspaceAssetIds(args: {
  mediaId: string;
  protectedIds: Set<string>;
  videoWorkspaces: ReviewWorkspaceRetentionStore;
}): Promise<void> {
  for (const raw of await args.videoWorkspaces.getAll()) {
    const workspace = parseVideoWorkspace(raw);
    if (!workspace || workspace.aggregateId === args.mediaId) continue;
    addReviewAssetIds(workspace, args.protectedIds);
  }
}

async function unlinkReviewAsset(args: {
  assetId: string;
  entryId: string;
  operation: PhysicalDeleteAssetOperation;
  stores: Pick<MediaReviewAssetRetentionStores, 'owners' | 'refs'>;
}): Promise<void> {
  await args.stores.owners.delete([
    PROJECT_ASSET_OWNER_KIND,
    args.entryId,
    PROJECT_MEDIA_ASSET_ROLE,
  ]);
  if ((await args.stores.owners.index('assetId').count(args.assetId)) === 0) {
    await args.stores.refs.delete(args.assetId);
    args.operation.assetIds.push(args.assetId);
  }
}

async function deleteReviewAsset(args: {
  entryId: string;
  operation: PhysicalDeleteAssetOperation;
  stores: MediaReviewAssetRetentionStores;
}): Promise<void> {
  const asset = parseProjectAssetEntry(await args.stores.projectAssets.get(args.entryId));
  const aggregateId = `${PROJECT_ASSET_PREFIX}${args.entryId}`;
  await args.stores.projectAssets.delete(args.entryId);
  await args.stores.media.delete(aggregateId);
  await args.stores.videoWorkspaces.delete(aggregateId);
  await args.stores.videoDrafts.delete(aggregateId);
  await args.stores.thumbnails.delete(aggregateId);
  if (asset) {
    await unlinkReviewAsset({
      assetId: asset.assetId,
      entryId: args.entryId,
      operation: args.operation,
      stores: args.stores,
    });
  }
}

export async function deleteExclusiveMediaReviewAssets(args: {
  mediaId: string;
  operation: PhysicalDeleteAssetOperation;
  primaryProjectAssetId: string | null;
  stores: MediaReviewAssetRetentionStores;
}): Promise<void> {
  const workspace = parseVideoWorkspace(await args.stores.videoWorkspaces.get(args.mediaId));
  if (!workspace) return;
  const reviewAssetIds = new Set<string>();
  addReviewAssetIds(workspace, reviewAssetIds);
  if (reviewAssetIds.size === 0) return;
  const protectedIds = await collectDirectProjectAssetIds(args.stores.videoProjects);
  await addOtherWorkspaceAssetIds({
    mediaId: args.mediaId,
    protectedIds,
    videoWorkspaces: args.stores.videoWorkspaces,
  });
  for (const entryId of reviewAssetIds) {
    if (entryId === args.primaryProjectAssetId || protectedIds.has(entryId)) continue;
    await deleteReviewAsset({ entryId, operation: args.operation, stores: args.stores });
  }
}

function requireReviewObject(
  objects: ReadonlyMap<string, StagedArchiveObject>,
  objectId: string
): StagedArchiveObject {
  const object = objects.get(objectId);
  if (!object) throw new Error(`Media archive object is missing: ${objectId}.`);
  return object;
}

export function prepareMediaReviewAssets(args: {
  createId: () => string;
  metadata: Pick<PortableMediaMetadata, 'reviewAssets'>;
  objects: ReadonlyMap<string, StagedArchiveObject>;
}): PreparedMediaReviewAsset[] {
  return (args.metadata.reviewAssets ?? []).map((item) => {
    const object = requireReviewObject(args.objects, item.objectId);
    const id = args.createId();
    const entry = parseProjectAssetEntry({
      ...item.entry,
      id,
      assetId: object.ref.assetId,
      mimeType: object.ref.mimeType,
      size: object.ref.size,
    });
    if (!entry) throw new Error('Restored media review asset is invalid.');
    return { entry, filename: item.filename, ref: object.ref, sourceId: item.entry.id };
  });
}

export function prepareStandaloneMediaVideoReview(args: {
  mediaId: string;
  metadata: Pick<PortableMediaMetadata, 'entry' | 'videoReview'>;
  original: StagedArchiveObject;
  reviewAssets: readonly PreparedMediaReviewAsset[];
}): ReturnType<typeof prepareVideoReviewRestore> | null {
  if (!args.metadata.videoReview) return null;
  if (args.metadata.videoReview.workspace.source.size !== args.original.ref.size) {
    throw new Error('Restored video review bytes are inconsistent.');
  }
  return prepareVideoReviewRestore({
    review: args.metadata.videoReview,
    sourceAggregateId: args.metadata.entry.id,
    targetAggregateId: args.mediaId,
    sourceAssetId: args.original.ref.assetId,
    assetIdMap: new Map(args.reviewAssets.map((asset) => [asset.sourceId, asset.entry.id])),
  });
}

export async function hasMediaReviewAssetConflict(
  projectAssets: Pick<MutableStore, 'get'>,
  reviewAssets: readonly PreparedMediaReviewAsset[]
): Promise<boolean> {
  const existing = await Promise.all(
    reviewAssets.map((asset) => projectAssets.get(asset.entry.id))
  );
  return existing.some((value) => value !== undefined);
}

export async function publishMediaReviewAssets(
  reviewAssets: readonly PreparedMediaReviewAsset[],
  stores: MediaReviewAssetStores
): Promise<void> {
  for (const asset of reviewAssets) {
    await stores.refs.put(asset.ref);
    await stores.owners.put({
      assetId: asset.entry.assetId,
      ownerId: asset.entry.id,
      ownerKind: PROJECT_ASSET_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await stores.projectAssets.put(asset.entry);
    await stores.media.put({
      ...buildProjectAssetMediaEntry(asset.entry),
      filename: asset.filename,
      originalFilename: asset.filename,
    });
  }
}
