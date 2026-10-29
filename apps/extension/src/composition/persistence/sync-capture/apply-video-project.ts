import {
  parsePreparedScenarioProjectDependencies,
  verifyScenarioProjectDependenciesInTransaction,
  type PreparedScenarioProjectDependency,
} from './scenario-dependencies';
import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { SCENARIO_CAPTURE_STORES } from './scenario-snapshot';
import {
  admitRemoteAssetResidencyInTransaction,
  readAssetResidencyCopyInTransaction,
} from '../assets/residency';
import { assetResidencyCopyId } from '../assets/residency-records';
import { putVideoReviewRestore } from '../review-workspaces/backup-restore';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import { initDB } from '../infrastructure/indexed-db/core';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import {
  hydratePreparedVideoProjectReplicaRoot,
  parsePreparedVideoProjectReplicaRoot,
  type PreparedVideoProjectReplicaRoot,
} from './prepared-project';
import type { IDBPTransaction } from 'idb';
import type {
  PersistenceMutationPermit,
  DurableAssetLifecyclePermit,
} from '../infrastructure/mutation-barrier';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_RESIDENCY_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  IMAGE_WORKSPACES_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  SCENARIO_ASSETS_STORE,
  STORE_NAME,
  VIDEO_PROJECT_REVISIONS_STORE,
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  publishPreparedVideoProjectRevisionInTransaction,
  publishPreparedVideoProjectSidecarsInTransaction,
  type PreparedVideoProjectRevision,
} from '../projects/revision-publication';
import { parseAssetRef, parseAssetOwner, type AssetRef } from '../assets';
import type { MediaLibraryEntry } from '../media-library/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import {
  parseVideoProjectEntry,
  parseProjectAssetEntry,
  parseProjectExportEntry,
} from '../projects/read-guards';
import type { VideoProjectEntry } from '../projects/contracts';
import { promoteProjectSourceLifecycles } from '../projects/new-reference-admission';
import { allocateVideoProjectRevisionInTransaction } from '../projects/revisions';
import {
  assertPreparedProjectAssetSources,
  assertPreparedLibrarySource,
} from '../projects/source-admission';
import { releaseUnpublishedProjectAssets } from '../media-library/delete-cascade.sources';
import { createVideoWorkspaceStore } from '../review-workspaces/storage';
import {
  captureRootKey,
  type SyncCaptureAppliedOperation,
  type SyncCaptureRootState,
} from './contracts';
import { collectCapturedProjectRecordingIds } from './project-snapshot';
import { isSupportedCaptureProject, parseSyncCaptureRecord } from './guards';

type ApplyTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;
interface ApplyIdentity {
  spaceId: string;
  rootId: string;
  rootKey: string;
  receiptKey: string;
  operationId: string;
  sourceDigest: string;
}

async function readAppliedReceipt(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  identity: ApplyIdentity
): Promise<number | null> {
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(identity.receiptKey);
  if (raw === undefined) return null;
  const receipt = parseSyncCaptureRecord(raw);
  if (
    !receipt ||
    receipt.kind !== 'applied-operation' ||
    receipt.key !== identity.receiptKey ||
    receipt.spaceId !== identity.spaceId ||
    receipt.operationId !== identity.operationId ||
    receipt.sourceDigest !== identity.sourceDigest ||
    receipt.rootKey !== identity.rootKey
  )
    throw new Error('Project application identity conflicts with its durable receipt.');
  return receipt.generation;
}

async function readApplicationGeneration(
  tx: ApplyTransaction,
  identity: ApplyIdentity,
  expectedBasis: readonly string[],
  hasCurrent: boolean
): Promise<number> {
  const key = JSON.stringify(['root-state', identity.rootKey]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
  if (raw === undefined) {
    if (expectedBasis.length) throw new VideoProjectApplyConflictError('project-changed');
    return 0;
  }
  const previous = parseSyncCaptureRecord(raw);
  if (
    !previous ||
    previous.kind !== 'root-state' ||
    previous.key !== key ||
    previous.rootKey !== identity.rootKey ||
    previous.spaceId !== identity.spaceId
  )
    throw new Error('Invalid project application root state.');
  if (
    (hasCurrent ? previous.deleted === true : previous.deleted !== true) ||
    JSON.stringify(previous.basis) !== JSON.stringify(expectedBasis)
  )
    throw new VideoProjectApplyConflictError('project-changed');
  return previous.generation;
}

async function prepareApplicationProvenance(
  tx: ApplyTransaction,
  identity: ApplyIdentity,
  expected: number,
  expectedBasis: readonly string[],
  hasCurrent: boolean
) {
  const previous = await readApplicationGeneration(tx, identity, expectedBasis, hasCurrent);
  if (previous !== expected) throw new VideoProjectApplyConflictError('project-changed');
  const generation = previous + 1;
  const createdAt = Date.now();
  const state: SyncCaptureRootState = {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', identity.rootKey]),
    createdAt,
    spaceId: identity.spaceId,
    rootKind: 'video-project',
    rootId: identity.rootId,
    rootKey: identity.rootKey,
    generation,
    basis: [identity.operationId],
  };
  const receipt: SyncCaptureAppliedOperation = {
    version: 1,
    kind: 'applied-operation',
    key: identity.receiptKey,
    createdAt,
    spaceId: identity.spaceId,
    rootKey: identity.rootKey,
    operationId: identity.operationId,
    sourceDigest: identity.sourceDigest,
    generation,
  };
  if (!parseSyncCaptureRecord(state) || !parseSyncCaptureRecord(receipt))
    throw new Error('Invalid project application provenance.');
  return { state, receipt };
}

interface PreparedVideoProjectDependency {
  entry: MediaLibraryEntry;
  ref: AssetRef;
  expectedGeneration: number;
  expectedBasis: readonly string[];
}

export interface ApplyPreparedVideoProjectRevisionInput {
  authorization?: SyncConnectionIdentity;
  root: PreparedVideoProjectReplicaRoot;
  operationId: string;
  sourceDigest: string;
  connectionGeneration: number;
  spaceId: string;
  profileCreatedAt: number;
  expectedBasis: readonly string[];
  expectedLocalGeneration: number;
  expectedWorkspaceRevision: number | null;
  dependencies: readonly PreparedVideoProjectDependency[];
  rootDependencies?: readonly PreparedScenarioProjectDependency[];
}

type HydratedProjectInput = Omit<ApplyPreparedVideoProjectRevisionInput, 'root'> & {
  root: Awaited<ReturnType<typeof hydratePreparedVideoProjectReplicaRoot>>;
};

class VideoProjectApplyConflictError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'unsupported-project'
      | 'profile-changed'
      | 'project-changed'
      | 'dependency-changed'
      | 'pending-local-change'
  ) {
    super(`Prepared project application refused: ${code}.`);
    this.name = 'VideoProjectApplyConflictError';
  }
}

function preparedAssets(root: PreparedVideoProjectRevision) {
  const assets = new Map<string, PreparedVideoProjectRevision['assets'][number]>();
  for (const asset of root.assets) {
    const entry = parseProjectAssetEntry(asset.entry);
    const ref = parseAssetRef(asset.ref);
    if (
      !entry ||
      !ref ||
      assets.has(entry.id) ||
      (!asset.reusePublished && asset.publishToLibrary !== false) ||
      ref.assetId !== entry.assetId ||
      ref.mimeType !== entry.mimeType ||
      ref.size !== entry.size
    )
      throw new VideoProjectApplyConflictError('unsupported-project');
    assets.set(entry.id, asset);
  }
  return assets;
}

/** One validation operation owns the declared and required native resource closure. */
class PreparedProjectClosure {
  private readonly assets;
  private readonly media;
  private readonly neededAssets = new Set<string>();
  private readonly neededMedia = new Set<string>();

  constructor(
    private readonly input: HydratedProjectInput,
    private readonly project: VideoProjectEntry['project']
  ) {
    this.assets = preparedAssets(input.root);
    this.media = new Map(
      input.dependencies.map((dependency) => [dependency.entry.id, dependency.entry])
    );
  }

  assertComplete(): void {
    for (const id of collectCapturedProjectRecordingIds(this.project))
      this.neededMedia.add(`recording:${id}`);
    for (const asset of this.project.assets) this.admitSource(asset);
    for (const item of this.input.root.exports ?? []) {
      if (item.videoReview)
        for (const reference of collectReviewAssetReferences(item.videoReview.workspace)) {
          if (!reference.startsWith('project-asset:'))
            throw new VideoProjectApplyConflictError('unsupported-project');
          this.neededAssets.add(reference.slice('project-asset:'.length));
        }
    }
    for (const id of this.neededAssets) {
      const asset = this.assets.get(id);
      if (!asset) throw new VideoProjectApplyConflictError('unsupported-project');
      if (asset.videoReview) {
        if (asset.reusePublished) throw new VideoProjectApplyConflictError('unsupported-project');
        for (const reference of collectReviewAssetReferences(asset.videoReview.workspace)) {
          if (!reference.startsWith('project-asset:'))
            throw new VideoProjectApplyConflictError('unsupported-project');
          this.neededAssets.add(reference.slice('project-asset:'.length));
        }
      }
      if (asset.entry.originMediaId) this.neededMedia.add(asset.entry.originMediaId);
      if (asset.reusePublished) this.neededMedia.add(`project-asset:${asset.entry.id}`);
    }
    this.assertDeclarations();
    this.assertSidecars();
  }

  private sourceResource(source: VideoProjectEntry['project']['assets'][number]['source']) {
    if (source.kind === 'recording') {
      const id = `recording:${source.recordingId}`;
      this.neededMedia.add(id);
      return this.media.get(id);
    }
    if (source.kind === 'library-asset') {
      this.neededMedia.add(source.mediaId);
      return this.media.get(source.mediaId);
    }
    if (source.kind === 'project-asset') {
      this.neededAssets.add(source.projectAssetId);
      if (source.originMediaId) this.neededMedia.add(source.originMediaId);
      return this.assets.get(source.projectAssetId)?.entry;
    }
    if (source.kind === 'scenario-asset')
      return this.input.rootDependencies
        ?.flatMap((item) => item.children)
        .find((child) => child.entry.id === source.scenarioAssetId)?.entry;
    return undefined;
  }

  private admitSource(asset: VideoProjectEntry['project']['assets'][number]): void {
    const resource = this.sourceResource(asset.source);
    if (
      !resource ||
      resource.size !== asset.metadata.size ||
      resource.mimeType !== asset.metadata.mimeType
    )
      throw new VideoProjectApplyConflictError('unsupported-project');
  }

  private assertDeclarations(): void {
    const scenarioChildren = new Set(
      this.project.assets.flatMap((asset) =>
        asset.source.kind === 'scenario-asset' ? [asset.source.scenarioAssetId] : []
      )
    );
    const roots = this.input.rootDependencies ?? [];
    const declaredChildren = roots.flatMap((item) => item.children);
    const provenance =
      this.project.source.kind === 'scenario' ? this.project.source.scenarioProjectId : undefined;
    if (
      new Set(roots.map((item) => item.rootId)).size !== roots.length ||
      declaredChildren.length !== scenarioChildren.size ||
      new Set(declaredChildren.map((child) => child.entry.id)).size !== declaredChildren.length ||
      declaredChildren.some((child) => !scenarioChildren.has(child.entry.id)) ||
      roots.some((item) => !item.children.length && item.rootId !== provenance) ||
      (provenance && !roots.some((item) => item.rootId === provenance))
    )
      throw new VideoProjectApplyConflictError('unsupported-project');
    const count = this.input.dependencies.length;
    if (
      this.neededAssets.size !== this.assets.size ||
      [...this.neededAssets].some((id) => !this.assets.has(id)) ||
      this.neededMedia.size !== count ||
      this.media.size !== count ||
      [...this.neededMedia].some((id) => !this.media.has(id))
    )
      throw new VideoProjectApplyConflictError('unsupported-project');
  }

  private assertSidecars(): void {
    const { root } = this.input;
    if (
      (root.thumbnail && root.thumbnail.assetId !== `video-project:${root.entry.id}`) ||
      (root.presentation &&
        (root.presentation.aggregateId !== root.entry.id ||
          root.presentation.aggregateKind !== 'video-project'))
    )
      throw new VideoProjectApplyConflictError('unsupported-project');
  }
}

function assertSupportedClosure(input: HydratedProjectInput): void {
  const project = parseVideoProjectEntry(input.root.entry);
  if (!project || !isSupportedCaptureProject(project.project) || input.dependencies.length > 32)
    throw new VideoProjectApplyConflictError('unsupported-project');
  new PreparedProjectClosure(input, project.project).assertComplete();
}

async function assertDependencyState(
  tx: ApplyTransaction,
  spaceId: string,
  dependency: PreparedVideoProjectDependency
): Promise<void> {
  const rootKey = captureRootKey(spaceId, 'media', dependency.entry.id);
  const key = JSON.stringify(['root-state', rootKey]);
  const state = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get(key));
  if (
    !state ||
    state.kind !== 'root-state' ||
    state.key !== key ||
    state.rootKey !== rootKey ||
    state.spaceId !== spaceId ||
    state.rootKind !== 'media' ||
    state.rootId !== dependency.entry.id ||
    state.deleted === true ||
    state.generation !== dependency.expectedGeneration ||
    dependency.expectedBasis.length !== 1 ||
    state.basis.length !== 1 ||
    state.basis[0] !== dependency.expectedBasis[0]
  )
    throw new VideoProjectApplyConflictError('dependency-changed');
}

async function assertNativeDependency(
  tx: ApplyTransaction,
  dependency: PreparedVideoProjectDependency
): Promise<void> {
  try {
    await assertPreparedLibrarySource(
      dependency,
      {
        recordings: tx.objectStore(STORE_NAME),
        media: tx.objectStore(MEDIA_LIBRARY_STORE),
        assets: tx.objectStore(PROJECT_ASSETS_STORE),
        exports: tx.objectStore(PROJECT_EXPORTS_STORE),
        refs: tx.objectStore(ASSET_REFS_STORE),
      },
      { allowRetainedTrash: true }
    );
  } catch {
    throw new VideoProjectApplyConflictError('dependency-changed');
  }
}

async function assertDependencies(
  tx: ApplyTransaction,
  spaceId: string,
  dependencies: readonly PreparedVideoProjectDependency[]
): Promise<void> {
  for (const dependency of dependencies) {
    const expected = parseMediaLibraryEntry(dependency.entry);
    if (!expected || expected.lifecycle?.storageClass !== 'library')
      throw new VideoProjectApplyConflictError('unsupported-project');
    await assertDependencyState(tx, spaceId, dependency);
    await assertNativeDependency(tx, dependency);
  }
}

async function assertNoPendingLocalCapture(tx: ApplyTransaction, rootKey: string): Promise<void> {
  for (const rawCapture of await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .index('rootKey')
    .getAll(rootKey)) {
    const capture = parseSyncCaptureRecord(rawCapture);
    if (!capture) throw new VideoProjectApplyConflictError('pending-local-change');
    if (
      capture.kind === 'sync-operation' &&
      capture.phase !== 'published' &&
      capture.rootKey === rootKey
    )
      throw new VideoProjectApplyConflictError('pending-local-change');
  }
}

async function assertLocalPredecessor(
  tx: ApplyTransaction,
  input: HydratedProjectInput,
  identity: ApplyIdentity
) {
  const raw: unknown = await tx.objectStore(VIDEO_PROJECTS_STORE).get(identity.rootId);
  const current = raw === undefined ? null : parseVideoProjectEntry(raw);
  if (
    (raw !== undefined && !current) ||
    (current ? (current.workspaceRevision ?? 0) : null) !== input.expectedWorkspaceRevision ||
    (current !== null && input.expectedLocalGeneration === 0)
  )
    throw new VideoProjectApplyConflictError('project-changed');
  await assertNoPendingLocalCapture(tx, identity.rootKey);
  return current;
}

function publicationStores(tx: ApplyTransaction) {
  return {
    assets: tx.objectStore(PROJECT_ASSETS_STORE),
    media: tx.objectStore(MEDIA_LIBRARY_STORE),
    refs: tx.objectStore(ASSET_REFS_STORE),
    owners: tx.objectStore(ASSET_OWNERS_STORE),
    projects: tx.objectStore(VIDEO_PROJECTS_STORE),
    videoWorkspaces: createVideoWorkspaceStore(tx),
    videoDrafts: tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE),
    thumbnails: tx.objectStore(THUMBNAILS_STORE),
    presentations: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
  };
}

type PreparedProjectAsset = PreparedVideoProjectRevision['assets'][number];

function assertPrivateEntryOwnership(
  rawEntry: unknown,
  rawRef: unknown,
  asset: PreparedProjectAsset,
  owned: ReadonlySet<string>
): void {
  if (rawEntry === undefined) return;
  if (
    !owned.has(asset.entry.id) ||
    rawRef === undefined ||
    JSON.stringify(parseProjectAssetEntry(rawEntry)) !==
      JSON.stringify(parseProjectAssetEntry(asset.entry))
  )
    throw new VideoProjectApplyConflictError('project-changed');
}

function assertPrivateRefIdentity(rawRef: unknown, asset: PreparedProjectAsset): void {
  if (
    rawRef !== undefined &&
    JSON.stringify(parseAssetRef(rawRef)) !== JSON.stringify(parseAssetRef(asset.ref))
  )
    throw new VideoProjectApplyConflictError('project-changed');
}

async function assertPrivateBindings(
  tx: ApplyTransaction,
  root: PreparedVideoProjectRevision,
  current: VideoProjectEntry | null
): Promise<void> {
  const owned = new Set(
    current?.project.assets.flatMap((asset) =>
      asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
    ) ?? []
  );
  for (const asset of root.assets) {
    if (asset.reusePublished) continue;
    const rawEntry: unknown = await tx.objectStore(PROJECT_ASSETS_STORE).get(asset.entry.id);
    const rawRef: unknown = await tx.objectStore(ASSET_REFS_STORE).get(asset.ref.assetId);
    assertPrivateEntryOwnership(rawEntry, rawRef, asset, owned);
    assertPrivateRefIdentity(rawRef, asset);
    if (
      (await tx.objectStore(MEDIA_LIBRARY_STORE).get(`project-asset:${asset.entry.id}`)) !==
      undefined
    )
      throw new VideoProjectApplyConflictError('project-changed');
  }
}

async function admitApplication(tx: ApplyTransaction, candidate: HydratedProjectInput) {
  const root = candidate.root;
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    profile.spaceId !== candidate.spaceId ||
    profile.createdAt !== candidate.profileCreatedAt
  )
    throw new VideoProjectApplyConflictError('profile-changed');
  const rootKey = captureRootKey(profile.spaceId, 'video-project', root.entry.id);
  const identity: ApplyIdentity = {
    spaceId: profile.spaceId,
    rootId: root.entry.id,
    rootKey,
    receiptKey: JSON.stringify(['applied-operation', profile.spaceId, candidate.operationId]),
    operationId: candidate.operationId,
    sourceDigest: candidate.sourceDigest,
  };
  const duplicate = await readAppliedReceipt(tx, identity);
  if (duplicate !== null) return { status: 'duplicate' as const, generation: duplicate };
  const connection =
    candidate.authorization === undefined
      ? null
      : await checkSyncConnectionAdmission(tx, candidate, candidate.authorization);
  if (!profile.enabled || profile.connectionGeneration !== candidate.connectionGeneration)
    throw new VideoProjectApplyConflictError('profile-changed');
  assertSupportedClosure(candidate);
  const current = await assertLocalPredecessor(tx, candidate, identity);
  const { state, receipt } = await prepareApplicationProvenance(
    tx,
    identity,
    candidate.expectedLocalGeneration,
    candidate.expectedBasis,
    current !== null
  );
  await assertDependencies(tx, profile.spaceId, candidate.dependencies);
  if (
    !(await verifyScenarioProjectDependenciesInTransaction(
      tx,
      profile.spaceId,
      candidate.rootDependencies ?? []
    ))
  )
    throw new VideoProjectApplyConflictError('dependency-changed');
  const stores = publicationStores(tx);
  await assertPreparedProjectAssetSources(root.assets, stores);
  await assertPrivateBindings(tx, root, current);
  return { status: 'ready' as const, current, state, receipt, stores, connection };
}

async function publishApplication(
  tx: ApplyTransaction,
  root: HydratedProjectInput['root'],
  context: Extract<Awaited<ReturnType<typeof admitApplication>>, { status: 'ready' }>,
  operation: ReturnType<typeof buildPhysicalDeleteOperation>,
  permit: PersistenceMutationPermit
): Promise<void> {
  const stores = context.stores;
  const workspaceRevision = await allocateVideoProjectRevisionInTransaction(
    tx,
    root.entry.id,
    context.current?.workspaceRevision ?? 0
  );
  await stores.thumbnails.delete(`video-project:${root.entry.id}`);
  await stores.presentations.delete(
    createAggregatePresentationKey({ id: root.entry.id, kind: 'video-project' })
  );
  await publishPreparedVideoProjectRevisionInTransaction({ root, stores, workspaceRevision });
  await publishPreparedVideoProjectSidecarsInTransaction({ root, stores, workspaceRevision });
  for (const item of root.exports ?? []) {
    const raw: unknown = await tx.objectStore(PROJECT_EXPORTS_STORE).get(item.entry.id);
    if (item.reuseExisting) {
      const ref: unknown = await tx.objectStore(ASSET_REFS_STORE).get(item.ref.assetId);
      const owner = parseAssetOwner(
        await tx.objectStore(ASSET_OWNERS_STORE).get(['project-export', item.entry.id, 'body'])
      );
      if (
        JSON.stringify(parseProjectExportEntry(raw)) !== JSON.stringify(item.entry) ||
        JSON.stringify(parseAssetRef(ref)) !== JSON.stringify(item.ref) ||
        !owner ||
        owner.assetId !== item.ref.assetId
      )
        throw new VideoProjectApplyConflictError('project-changed');
      continue;
    }
    if (
      raw !== undefined ||
      !context.connection ||
      (await tx.objectStore(ASSET_REFS_STORE).get(item.ref.assetId)) !== undefined ||
      (await tx.objectStore(ASSET_OWNERS_STORE).get(['project-export', item.entry.id, 'body'])) !==
        undefined ||
      (await tx.objectStore(MEDIA_LIBRARY_STORE).get(`export:${item.entry.id}`)) !== undefined
    )
      throw new VideoProjectApplyConflictError('project-changed');
    await admitRemoteAssetResidencyInTransaction(
      tx,
      {
        operationId: context.receipt.operationId,
        target: { kind: 'opfs', ref: item.ref },
        remote: { ...item.remote, binding: context.connection.binding },
        lastUsedAt: Date.now(),
      },
      permit
    );
    await stores.refs.put(item.ref);
    await stores.owners.put({
      assetId: item.ref.assetId,
      ownerKind: 'project-export',
      ownerId: item.entry.id,
      role: 'body',
    });
    await tx.objectStore(PROJECT_EXPORTS_STORE).put(item.entry);
    if (item.videoReview)
      await putVideoReviewRestore({
        review: item.videoReview,
        workspaces: stores.videoWorkspaces,
        drafts: stores.videoDrafts,
      });
    if (item.thumbnail) await stores.thumbnails.put(item.thumbnail);
  }
  await promoteProjectSourceLifecycles(
    root.entry.project,
    {
      mediaLibraryStore: stores.media,
      projectAssetStore: stores.assets,
      scenarioAssetStore: tx.objectStore(SCENARIO_ASSETS_STORE),
      recordingStore: tx.objectStore(STORE_NAME),
    },
    Date.now()
  );
  const detached = new Set(
    context.current?.project.assets.flatMap((asset) =>
      asset.source.kind === 'project-asset' ? [asset.source.projectAssetId] : []
    ) ?? []
  );
  await releaseUnpublishedProjectAssets(tx, detached, operation);
  if (operation.assetIds.length || operation.privateSources?.length)
    await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
  await tx.objectStore(SYNC_CAPTURE_STORE).put(context.state);
  await tx.objectStore(SYNC_CAPTURE_STORE).add(context.receipt);
}

async function readCompletedProjectReceipt(
  input: ApplyPreparedVideoProjectRevisionInput
): Promise<number | null> {
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    profile.spaceId !== input.spaceId ||
    profile.createdAt !== input.profileCreatedAt
  )
    throw new VideoProjectApplyConflictError('profile-changed');
  const rootKey = captureRootKey(input.spaceId, 'video-project', input.root.entry.id);
  const result = await readAppliedReceipt(tx, {
    spaceId: input.spaceId,
    rootId: input.root.entry.id,
    rootKey,
    receiptKey: JSON.stringify(['applied-operation', input.spaceId, input.operationId]),
    operationId: input.operationId,
    sourceDigest: input.sourceDigest,
  });
  await tx.done;
  return result;
}

/** Read a retained export without granting publication or replacement authority. */
export async function loadProjectReplicaExport(input: {
  spaceId: string;
  profileCreatedAt: number;
  connectionGeneration: number;
  authorization?: SyncConnectionIdentity;
  projectId: string;
  exportId: string;
}) {
  const db = await initDB();
  const tx = db.transaction(
    [
      SYNC_CAPTURE_STORE,
      SYNC_CONNECTION_STORE,
      PROJECT_EXPORTS_STORE,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      ASSET_RESIDENCY_STORE,
    ],
    'readonly'
  );
  const connection = await checkSyncConnectionAdmission(tx, input, input.authorization ?? null);
  const raw: unknown = await tx.objectStore(PROJECT_EXPORTS_STORE).get(input.exportId);
  if (raw === undefined) {
    await tx.done;
    return null;
  }
  const entry = parseProjectExportEntry(raw);
  if (!entry || entry.id !== input.exportId || entry.projectId !== input.projectId)
    throw new VideoProjectApplyConflictError('project-changed');
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(entry.assetId));
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get(['project-export', entry.id, 'body'])
  );
  if (
    !ref ||
    ref.size !== entry.size ||
    ref.mimeType !== entry.mimeType ||
    !owner ||
    owner.assetId !== ref.assetId ||
    owner.ownerKind !== 'project-export' ||
    owner.ownerId !== entry.id ||
    owner.role !== 'body'
  )
    throw new VideoProjectApplyConflictError('project-changed');
  const copy = await readAssetResidencyCopyInTransaction(
    tx,
    assetResidencyCopyId({ kind: 'opfs', ref })
  );
  if (
    copy &&
    (!connection ||
      JSON.stringify(copy.remote.binding) !== JSON.stringify(connection.binding) ||
      copy.target.kind !== 'opfs' ||
      JSON.stringify(copy.target.ref) !== JSON.stringify(ref))
  )
    throw new VideoProjectApplyConflictError('project-changed');
  await tx.done;
  return { entry, ref, copy };
}

/** Caller retains staged bytes and verifies sourceDigest before this native command. */
export async function applyPreparedVideoProjectRevision(
  input: ApplyPreparedVideoProjectRevisionInput,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<{ status: 'applied' | 'duplicate'; generation: number }> {
  if (
    (input.authorization !== undefined && !parseSyncConnectionIdentity(input.authorization)) ||
    !input.spaceId ||
    !Number.isSafeInteger(input.profileCreatedAt) ||
    input.profileCreatedAt < 0 ||
    !Array.isArray(input.expectedBasis) ||
    input.expectedBasis.length !== (input.expectedLocalGeneration === 0 ? 0 : 1) ||
    input.expectedBasis.some((id) => typeof id !== 'string' || !id || id.length > 256) ||
    !input.operationId ||
    input.operationId.length > 256 ||
    !/^[a-f0-9]{64}$/u.test(input.sourceDigest) ||
    !Number.isSafeInteger(input.expectedLocalGeneration) ||
    input.expectedLocalGeneration < 0 ||
    !Number.isSafeInteger(input.connectionGeneration) ||
    input.connectionGeneration < 1 ||
    (input.expectedWorkspaceRevision !== null &&
      (!Number.isSafeInteger(input.expectedWorkspaceRevision) ||
        input.expectedWorkspaceRevision < 0))
  )
    throw new VideoProjectApplyConflictError('invalid-input');
  const staged = structuredClone(input);
  if (staged.rootDependencies !== undefined)
    staged.rootDependencies = parsePreparedScenarioProjectDependencies(staged.rootDependencies);
  try {
    staged.root = parsePreparedVideoProjectReplicaRoot(staged.root);
  } catch {
    throw new VideoProjectApplyConflictError('unsupported-project');
  }
  const duplicate = await readCompletedProjectReceipt(staged);
  if (duplicate !== null) return { status: 'duplicate', generation: duplicate };
  const root = await hydratePreparedVideoProjectReplicaRoot(staged.root);
  const candidate: HydratedProjectInput = { ...staged, root };
  const operation = buildPhysicalDeleteOperation([]);
  const result = await runWithIndexedDbMutation(async (db, permit) => {
    const tx = db.transaction(
      [
        ...SCENARIO_CAPTURE_STORES,
        ASSET_RESIDENCY_STORE,
        VIDEO_PROJECT_REVISIONS_STORE,
        STORE_NAME,
        VIDEO_PROJECTS_STORE,
        PROJECT_ASSETS_STORE,
        PROJECT_EXPORTS_STORE,
        MEDIA_LIBRARY_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_HISTORY_STORE,
        VIDEO_WORKSPACE_DRAFTS_STORE,
        THUMBNAILS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
        IMAGE_WORKSPACES_STORE,
        SCENARIO_ASSETS_STORE,
        SYNC_CAPTURE_STORE,
        SYNC_CONNECTION_STORE,
      ],
      'readwrite'
    );
    try {
      const context = await admitApplication(tx, candidate);
      if (context.status === 'duplicate') {
        await tx.done;
        return context;
      }
      await publishApplication(tx, root, context, operation, permit);
      await tx.done;
      return { status: 'applied' as const, generation: context.state.generation };
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
  if (operation.assetIds.length || operation.privateSources?.length)
    await completePhysicalDeleteOperation(operation, lifecyclePermit).catch(() => undefined);
  return result;
}
