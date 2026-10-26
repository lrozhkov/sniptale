import {
  readAllWorkspaceStorage,
  type WorkspaceStorageEnumerationTransaction,
} from '../review-workspaces/storage';
import type { AssetRef } from '../assets';
import { parseAssetRef } from '../assets';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { ProjectAssetEntry } from './contracts';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { parseProjectAssetEntry, parseProjectExportEntry } from './read-guards';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  mediaDependencyTarget,
  scenarioChildIsUnrelated,
  videoEntryIsUnrelated,
  reviewWorkspaceUsesMedia,
  type MediaDependencyTarget,
} from '../media-library/dependencies';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { MediaAssetDeletionBlockedError } from '../media-library/deletion-errors';

import {
  PROJECT_ASSETS_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  VIDEO_WORKSPACES_STORE,
} from '../infrastructure/indexed-db/core';

type StandaloneSourceTransaction = WorkspaceStorageEnumerationTransaction;

/** Standalone publication cannot replace even its own retained review's source bytes. */
export async function assertStandaloneMediaSourceReplaceable(
  source: MediaDependencyTarget,
  tx: StandaloneSourceTransaction
): Promise<void> {
  if ((await tx.objectStore(VIDEO_WORKSPACES_STORE).get(source.id)) !== undefined)
    throw new MediaAssetDeletionBlockedError('source-unavailable');
  await assertMediaSourceReplaceable(source, {
    assets: tx.objectStore(PROJECT_ASSETS_STORE),
    projects: tx.objectStore(VIDEO_PROJECTS_STORE),
    scenarioAssets: tx.objectStore(SCENARIO_ASSETS_STORE),
    videoWorkspaces: { getAll: () => readAllWorkspaceStorage(tx) },
  });
}

interface SourceConsumerStores {
  assets: { getAll(): Promise<unknown[]> };
  projects: { getAll(): Promise<unknown[]> };
  scenarioAssets: { getAll(): Promise<unknown[]> };
  videoWorkspaces: { getAll(): Promise<unknown[]> };
}

/** Source-byte replacement cannot silently change an identity retained by another consumer. */
export async function assertMediaSourceReplaceable(
  source: MediaDependencyTarget,
  stores: SourceConsumerStores,
  replacingProjectId?: string,
  replacingAggregates: ReadonlySet<string> = new Set([source.id])
): Promise<void> {
  const target = mediaDependencyTarget(source, await stores.assets.getAll());
  if (
    [...(target.privateProjectAssetIds ?? [])].some(
      (id) => !replacingAggregates.has(`project-asset:${id}`)
    )
  )
    throw new MediaAssetDeletionBlockedError('source-unavailable');
  const [projects, children, reviews] = await Promise.all([
    stores.projects.getAll(),
    stores.scenarioAssets.getAll(),
    stores.videoWorkspaces.getAll(),
  ]);
  if (
    children.some((child) => !scenarioChildIsUnrelated(child, target)) ||
    projects.some(
      (project) =>
        !(
          isRecord(project) &&
          replacingProjectId !== undefined &&
          project['id'] === replacingProjectId
        ) && !videoEntryIsUnrelated(project, target, new Set())
    ) ||
    reviews.some((raw) => {
      if (
        isRecord(raw) &&
        typeof raw['aggregateId'] === 'string' &&
        replacingAggregates.has(raw['aggregateId'])
      )
        return false;
      const review = parseVideoWorkspace(raw);
      return !review || reviewWorkspaceUsesMedia(review, target);
    })
  )
    throw new MediaAssetDeletionBlockedError('source-unavailable');
}

type ReadStore = { get(id: string): Promise<unknown> };
interface PreparedAssetBinding {
  entry: ProjectAssetEntry;
  ref: AssetRef;
  reusePublished?: boolean;
  publishToLibrary?: boolean;
}

/** Revalidate prepared identities in the consumer transaction, before replacement or publication writes. */
export async function assertPreparedProjectAssetSources(
  resources: readonly PreparedAssetBinding[],
  stores: { assets: ReadStore; media: ReadStore; refs: ReadStore },
  publishingMediaId?: string
): Promise<void> {
  for (const resource of resources) {
    const originId = resource.entry.originMediaId;
    if (originId && !resource.reusePublished && resource.publishToLibrary !== false)
      throw new Error('Private project membership cannot publish an independent material.');
    if (originId && originId !== publishingMediaId) {
      const origin = parseMediaLibraryEntry(await stores.media.get(originId));
      if (!origin || origin.id !== originId)
        throw new Error('Private project source changed after preparation.');
    }
    if (!resource.reusePublished) continue;
    await assertSharedProjectAsset(resource, stores);
  }
}

async function assertSharedProjectAsset(
  resource: PreparedAssetBinding,
  stores: { assets: ReadStore; media: ReadStore; refs: ReadStore }
): Promise<void> {
  const id = resource.entry.id;
  const media = parseMediaLibraryEntry(await stores.media.get(`project-asset:${id}`));
  const entry = parseProjectAssetEntry(await stores.assets.get(id));
  if (
    !media ||
    media.id !== `project-asset:${id}` ||
    media.source.kind !== 'project-asset' ||
    media.source.projectAssetId !== id ||
    !entry ||
    entry.id !== id ||
    entry.assetId !== resource.ref.assetId ||
    entry.assetId !== resource.entry.assetId ||
    entry.size !== resource.ref.size ||
    entry.mimeType !== resource.ref.mimeType
  )
    throw new Error('Published project source changed after preparation.');
  const ref = parseAssetRef(await stores.refs.get(entry.assetId));
  if (
    !ref ||
    ref.assetId !== resource.ref.assetId ||
    ref.size !== resource.ref.size ||
    ref.mimeType !== resource.ref.mimeType
  )
    throw new Error('Published project bytes changed after preparation.');
}

interface PreparedLibrarySourceStores {
  media: ReadStore;
  assets: ReadStore;
  exports: ReadStore;
  refs: ReadStore;
}

function changedLibrarySource(): never {
  throw new Error('Prepared Library source changed after preparation.');
}

async function readProjectAssetSource(
  media: MediaLibraryEntry,
  id: string,
  store: ReadStore
): Promise<string> {
  const asset = parseProjectAssetEntry(await store.get(id));
  if (!asset || asset.id !== id || asset.size !== media.size || asset.mimeType !== media.mimeType)
    return changedLibrarySource();
  return asset.assetId;
}

async function readProjectExportSource(
  media: MediaLibraryEntry,
  source: Extract<MediaLibraryEntry['source'], { kind: 'project-export' }>,
  store: ReadStore
): Promise<string> {
  const exported = parseProjectExportEntry(await store.get(source.exportId));
  if (
    !exported ||
    exported.id !== source.exportId ||
    exported.projectId !== source.projectId ||
    exported.size !== media.size ||
    (exported.mimeType ?? 'video/webm') !== media.mimeType
  )
    return changedLibrarySource();
  return exported.assetId;
}

async function readLibrarySourceAssetId(
  media: MediaLibraryEntry,
  stores: PreparedLibrarySourceStores
): Promise<string> {
  const source = media.source;
  switch (source.kind) {
    case 'stored-asset':
      return source.assetId;
    case 'project-asset':
      return readProjectAssetSource(media, source.projectAssetId, stores.assets);
    case 'project-export':
      return readProjectExportSource(media, source, stores.exports);
    case 'recording':
    case 'screenshot':
    case 'web-snapshot':
      throw new Error('Prepared Library source kind is outside the sync apply profile.');
  }
}

/** Recheck a prepared live source in the consumer transaction without reading its bytes. */
export async function assertPreparedLibrarySource(
  resource: { entry: MediaLibraryEntry; ref: AssetRef },
  stores: PreparedLibrarySourceStores
): Promise<void> {
  const expected = parseMediaLibraryEntry(resource.entry);
  const current = parseMediaLibraryEntry(await stores.media.get(resource.entry.id));
  const expectedRef = parseAssetRef(resource.ref);
  if (
    !expected ||
    !current ||
    !expectedRef ||
    current.blob !== undefined ||
    current.lifecycle?.trashedAt !== undefined ||
    current.size !== expectedRef.size ||
    current.mimeType !== expectedRef.mimeType ||
    JSON.stringify(current) !== JSON.stringify(expected)
  )
    return changedLibrarySource();
  const assetId = await readLibrarySourceAssetId(current, stores);
  if (assetId !== expectedRef.assetId) return changedLibrarySource();
  const actualRef = parseAssetRef(await stores.refs.get(assetId));
  if (!actualRef || JSON.stringify(actualRef) !== JSON.stringify(expectedRef))
    return changedLibrarySource();
}
