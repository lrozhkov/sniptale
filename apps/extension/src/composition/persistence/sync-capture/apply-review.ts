import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import { sameReviewVideoContainer } from '../../../features/video/review/validation';
import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { initDB } from '../infrastructure/indexed-db/core';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  IMAGE_WORKSPACES_STORE,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  THUMBNAILS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import type { DurableAssetLifecyclePermit } from '../infrastructure/mutation-barrier';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { parseAssetRef, parseAssetOwner } from '../assets/guards';
import { enqueuePrivateSourceRetirement } from '../assets/private-source-retention';
import { parseProjectAssetEntry } from '../projects/read-guards';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { assertPreparedLibrarySource } from '../projects/source-admission';
import { putVideoReviewRestore } from '../review-workspaces/backup-restore';
import { createVideoWorkspaceStore, readWorkspaceStorage } from '../review-workspaces/storage';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from '../review-workspaces/parser';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import type { VideoWorkspaceSnapshot } from '../review-workspaces/contracts';
import {
  parsePreparedVideoReviewReplicaRoot,
  hydratePreparedVideoReviewReplicaRoot,
  type PreparedVideoReviewReplicaRoot,
} from './prepared-review';
import type { ApplyPreparedVideoProjectRevisionInput } from './apply-video-project';
import {
  captureRootKey,
  type SyncCaptureRootState,
  type SyncCaptureAppliedOperation,
} from './contracts';
import { parseSyncCaptureRecord } from './guards';
import { freezeVideoReviewInTransaction, digestCapturedVideoReviewRows } from './review-snapshot';
import { freezeMediaInTransaction } from './freeze';
import { isBoundedImageMetadata } from './image-snapshot';
import { digestCapturedMediaRows } from './freeze';
import { allocateVideoReviewRevision } from './capture';

/** Exact native predecessor and independently admitted Library dependencies for one review. */
export interface ApplyPreparedVideoReviewReplicaInput {
  root: PreparedVideoReviewReplicaRoot;
  operationId: string;
  sourceDigest: string;
  authorization?: SyncConnectionIdentity;
  connectionGeneration: number;
  spaceId: string;
  profileCreatedAt: number;
  expectedBasis: readonly string[];
  expectedLocalGeneration: number;
  expectedWorkspaceRevision: number | null;
  dependencies: ApplyPreparedVideoProjectRevisionInput['dependencies'];
}

type ReadTx = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
type WriteTx = IDBPTransaction<unknown, string[], 'readwrite'>;
type Dependency = ApplyPreparedVideoReviewReplicaInput['dependencies'][number];
const identity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 256;
const ordinal = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
function refused(): never {
  throw new Error('Prepared video review application conflicts with native state.');
}
function same(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type ApplyReviewHeader = Omit<ApplyPreparedVideoReviewReplicaInput, 'root' | 'dependencies'> & {
  root: unknown;
  dependencies: unknown[];
};

function isApplyReviewHeader(value: unknown): value is ApplyReviewHeader {
  if (
    !isRecord(value) ||
    (value['authorization'] !== undefined &&
      !parseSyncConnectionIdentity(value['authorization'])) ||
    !isBoundedImageMetadata(value, false) ||
    !identity(value['operationId']) ||
    !identity(value['spaceId']) ||
    typeof value['sourceDigest'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['sourceDigest']) ||
    !ordinal(value['profileCreatedAt']) ||
    !ordinal(value['connectionGeneration']) ||
    value['connectionGeneration'] < 1 ||
    !ordinal(value['expectedLocalGeneration']) ||
    (value['expectedWorkspaceRevision'] !== null && !ordinal(value['expectedWorkspaceRevision'])) ||
    !Array.isArray(value['expectedBasis']) ||
    !value['expectedBasis'].every(identity) ||
    value['expectedBasis'].length !== (value['expectedLocalGeneration'] === 0 ? 0 : 1) ||
    !Array.isArray(value['dependencies']) ||
    value['dependencies'].length > 32
  )
    return false;
  return true;
}

function isSupportedReviewDependencySource(entry: Dependency['entry']): boolean {
  const source = entry.source;
  if (source.kind === 'recording') return entry.id === `recording:${source.recordingId}`;
  return (
    source.kind === 'project-asset' &&
    entry.id === `project-asset:${source.projectAssetId}` &&
    !entry.recordingMetadata &&
    !entry.recordingGroup
  );
}

function parseReviewDependency(raw: unknown): Dependency | null {
  if (!isRecord(raw)) return null;
  const entry = parseMediaLibraryEntry(raw['entry']);
  const ref = parseAssetRef(raw['ref']);
  if (
    !entry ||
    !ref ||
    entry.blob !== undefined ||
    entry.lifecycle?.storageClass !== 'library' ||
    !isSupportedReviewDependencySource(entry) ||
    entry.size !== ref.size ||
    entry.mimeType !== ref.mimeType ||
    !ordinal(raw['expectedGeneration']) ||
    raw['expectedGeneration'] < 1 ||
    !Array.isArray(raw['expectedBasis']) ||
    raw['expectedBasis'].length !== 1 ||
    !raw['expectedBasis'].every(identity)
  )
    return null;
  return {
    entry,
    ref,
    expectedGeneration: raw['expectedGeneration'],
    expectedBasis: raw['expectedBasis'],
  };
}

function dependenciesMatchReviewSource(
  root: PreparedVideoReviewReplicaRoot,
  dependencies: readonly Dependency[]
): boolean {
  const expected = new Set([root.sourceMediaId]);
  for (const asset of root.assets) {
    if (asset.entry.originMediaId) expected.add(asset.entry.originMediaId);
    if (asset.reusePublished) expected.add(`project-asset:${asset.entry.id}`);
  }
  const actual = new Set(dependencies.map((dependency) => dependency.entry.id));
  const source = dependencies.find((dependency) => dependency.entry.id === root.sourceMediaId);
  if (
    !source ||
    (source.entry.kind !== 'video' && source.entry.kind !== 'recording') ||
    !source.ref.mimeType.startsWith('video/') ||
    source.ref.assetId !== root.review.workspace.sourceAssetId ||
    source.ref.size !== root.review.workspace.source.size ||
    !sameReviewVideoContainer(root.review.workspace.source.mimeType, source.ref.mimeType) ||
    actual.size !== dependencies.length ||
    actual.size !== expected.size ||
    [...expected].some((id) => !actual.has(id))
  )
    return false;
  return true;
}

/** Parse the receiving boundary before any durable or binary work. */
export function parseApplyPreparedVideoReviewReplicaInput(
  value: unknown
): ApplyPreparedVideoReviewReplicaInput | null {
  if (!isApplyReviewHeader(value)) return null;
  let root: PreparedVideoReviewReplicaRoot;
  try {
    root = parsePreparedVideoReviewReplicaRoot(value['root']);
  } catch {
    return null;
  }
  const dependencies: Dependency[] = [];
  for (const raw of value['dependencies']) {
    const dependency = parseReviewDependency(raw);
    if (!dependency) return null;
    dependencies.push(dependency);
  }
  if (!dependenciesMatchReviewSource(root, dependencies)) return null;
  return structuredClone({
    root,
    dependencies,
    ...(value['authorization'] !== undefined ? { authorization: value['authorization'] } : {}),
    operationId: value['operationId'],
    sourceDigest: value['sourceDigest'],
    spaceId: value['spaceId'],
    profileCreatedAt: value['profileCreatedAt'],
    connectionGeneration: value['connectionGeneration'],
    expectedBasis: value['expectedBasis'],
    expectedLocalGeneration: value['expectedLocalGeneration'],
    expectedWorkspaceRevision: value['expectedWorkspaceRevision'],
  });
}

function rootKey(input: ApplyPreparedVideoReviewReplicaInput) {
  return captureRootKey(input.spaceId, 'video-review', input.root.review.workspace.aggregateId);
}
async function receipt(
  tx: ReadTx,
  input: ApplyPreparedVideoReviewReplicaInput
): Promise<number | null> {
  const key = JSON.stringify(['applied-operation', input.spaceId, input.operationId]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
  if (raw === undefined) return null;
  const parsed = parseSyncCaptureRecord(raw);
  if (
    !parsed ||
    parsed.kind !== 'applied-operation' ||
    parsed.key !== key ||
    parsed.spaceId !== input.spaceId ||
    parsed.operationId !== input.operationId ||
    parsed.rootKey !== rootKey(input) ||
    parsed.sourceDigest !== input.sourceDigest
  )
    refused();
  return parsed.generation;
}
async function profile(tx: ReadTx, input: ApplyPreparedVideoReviewReplicaInput, enabled: boolean) {
  const parsed = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !parsed ||
    parsed.kind !== 'profile' ||
    parsed.spaceId !== input.spaceId ||
    parsed.createdAt !== input.profileCreatedAt ||
    (enabled && (!parsed.enabled || parsed.connectionGeneration !== input.connectionGeneration))
  )
    refused();
}
async function ownPredecessor(tx: WriteTx, input: ApplyPreparedVideoReviewReplicaInput) {
  const id = input.root.review.workspace.aggregateId;
  const stored = await readWorkspaceStorage(tx, id);
  const rawDraft: unknown = await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(id);
  const workspace = stored.logical === undefined ? null : parseVideoWorkspace(stored.logical);
  if (
    (stored.logical !== undefined && !workspace) ||
    (!workspace && rawDraft !== undefined) ||
    (workspace?.revision ?? null) !== input.expectedWorkspaceRevision
  )
    refused();
  const draft =
    rawDraft === undefined
      ? null
      : parseVideoWorkspaceDraft(rawDraft, workspace?.source.duration ?? 0);
  if (rawDraft !== undefined && (!draft || draft.aggregateId !== id)) refused();
  const stateKey = JSON.stringify(['root-state', rootKey(input)]);
  const rawState: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(stateKey);
  const state = rawState === undefined ? null : parseSyncCaptureRecord(rawState);
  if (rawState !== undefined && (!state || state.kind !== 'root-state')) refused();
  if (state && state.kind !== 'root-state') refused();
  if (
    state
      ? state.rootKey !== rootKey(input) ||
        state.spaceId !== input.spaceId ||
        state.rootKind !== 'video-review' ||
        state.rootId !== id ||
        state.generation !== input.expectedLocalGeneration ||
        !same(state.basis, input.expectedBasis) ||
        (workspace ? state.deleted === true : state.deleted !== true)
      : workspace !== null ||
        input.expectedLocalGeneration !== 0 ||
        input.expectedBasis.length !== 0
  )
    refused();
  if (
    id !== input.root.sourceMediaId &&
    (await tx.objectStore(MEDIA_LIBRARY_STORE).get(id)) !== undefined
  )
    refused();
  if (state?.deleted && !ordinal(state.nativeRevision)) refused();
  if (workspace) {
    if (
      workspace.sourceAssetId !== input.root.review.workspace.sourceAssetId ||
      (workspace.sourceMediaId ?? workspace.aggregateId) !== input.root.sourceMediaId ||
      !same(workspace.source, input.root.review.workspace.source)
    )
      refused();
    const frozen = await freezeVideoReviewInTransaction(tx, id);
    if (state?.nativeDigest !== digestCapturedVideoReviewRows(frozen)) refused();
  }
  for (const raw of await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .index('rootKey')
    .getAll(rootKey(input))) {
    const capture = parseSyncCaptureRecord(raw);
    if (!capture || (capture.kind === 'sync-operation' && capture.phase !== 'published')) refused();
  }
  return { workspace, draft, state };
}
async function admitDependencies(tx: WriteTx, input: ApplyPreparedVideoReviewReplicaInput) {
  for (const dependency of input.dependencies) {
    const key = captureRootKey(input.spaceId, 'media', dependency.entry.id);
    const parsed = parseSyncCaptureRecord(
      await tx.objectStore(SYNC_CAPTURE_STORE).get(JSON.stringify(['root-state', key]))
    );
    if (
      !parsed ||
      parsed.kind !== 'root-state' ||
      parsed.rootKey !== key ||
      parsed.spaceId !== input.spaceId ||
      parsed.rootKind !== 'media' ||
      parsed.rootId !== dependency.entry.id ||
      parsed.deleted === true ||
      parsed.generation !== dependency.expectedGeneration ||
      !same(parsed.basis, dependency.expectedBasis)
    )
      refused();
    await assertPreparedLibrarySource(
      dependency,
      {
        media: tx.objectStore(MEDIA_LIBRARY_STORE),
        assets: tx.objectStore(PROJECT_ASSETS_STORE),
        exports: tx.objectStore(PROJECT_EXPORTS_STORE),
        recordings: tx.objectStore(STORE_NAME),
        refs: tx.objectStore(ASSET_REFS_STORE),
      },
      { allowRetainedTrash: true }
    );
    const source = await freezeMediaInTransaction(tx, dependency.entry.id, {
      allowIndependentReview: true,
    });
    const child = 'recording' in source ? source.recording : source.projectAsset;
    const ownerKind = 'recording' in source ? 'recording' : 'project-asset';
    const owner = parseAssetOwner(
      await tx.objectStore(ASSET_OWNERS_STORE).get([ownerKind, child.id, 'body'])
    );
    if (
      !owner ||
      owner.ownerKind !== ownerKind ||
      owner.ownerId !== child.id ||
      owner.role !== 'body' ||
      owner.assetId !== source.ref.assetId ||
      !same(source.media, dependency.entry) ||
      !same(source.ref, dependency.ref) ||
      parsed.nativeDigest !== digestCapturedMediaRows(source)
    )
      refused();
    if (
      dependency.entry.id === input.root.sourceMediaId &&
      'projectAsset' in source &&
      source.projectAsset.originMediaId
    )
      refused();
  }
}
async function admitAssets(tx: WriteTx, input: ApplyPreparedVideoReviewReplicaInput) {
  for (const asset of input.root.assets) {
    const id = asset.entry.id;
    const raw: unknown = await tx.objectStore(PROJECT_ASSETS_STORE).get(id);
    const ref: unknown = await tx.objectStore(ASSET_REFS_STORE).get(asset.ref.assetId);
    if (asset.reusePublished) {
      const dependency = input.dependencies.find(
        (entry) => entry.entry.id === `project-asset:${id}`
      );
      if (
        !dependency ||
        !same(parseProjectAssetEntry(raw), asset.entry) ||
        !same(parseAssetRef(ref), asset.ref) ||
        !same(dependency.ref, asset.ref)
      )
        refused();
    } else {
      if (
        raw !== undefined ||
        (ref !== undefined && !same(parseAssetRef(ref), asset.ref)) ||
        (await tx.objectStore(ASSET_OWNERS_STORE).get(['project-asset', id, 'body'])) !==
          undefined ||
        (await tx.objectStore(MEDIA_LIBRARY_STORE).get(`project-asset:${id}`)) !== undefined
      )
        refused();
      const nested = await readWorkspaceStorage(tx, `project-asset:${id}`);
      if (
        nested.logical !== undefined ||
        (await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(`project-asset:${id}`)) !==
          undefined ||
        (await tx
          .objectStore(SYNC_CAPTURE_STORE)
          .get(
            JSON.stringify([
              'root-state',
              captureRootKey(input.spaceId, 'video-review', `project-asset:${id}`),
            ])
          )) !== undefined
      )
        refused();
    }
  }
}
async function publishSnapshot(
  tx: WriteTx,
  snapshot: VideoWorkspaceSnapshot,
  current: VideoWorkspaceSnapshot | null
) {
  const revision = await allocateVideoReviewRevision(
    tx,
    snapshot.workspace.aggregateId,
    Math.max(snapshot.workspace.revision, current?.workspace.revision ?? 0) + 1
  );
  if (!Number.isSafeInteger(revision)) refused();
  const draftRevision =
    Math.max(snapshot.draft?.revision ?? 0, current?.draft?.revision ?? 0, revision) + 1;
  if (!Number.isSafeInteger(draftRevision)) refused();
  await putVideoReviewRestore({
    review: {
      workspace: { ...snapshot.workspace, revision },
      draft: snapshot.draft ? { ...snapshot.draft, revision: draftRevision } : null,
    },
    workspaces: createVideoWorkspaceStore(tx),
    drafts: tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE),
  });
  return revision;
}

type HydratedReviewReplica = Awaited<ReturnType<typeof hydratePreparedVideoReviewReplicaRoot>>;
type ReviewPredecessor = Awaited<ReturnType<typeof ownPredecessor>>;
type PrivateSourceRetirement = ReturnType<typeof buildPhysicalDeleteOperation>;

async function publishNativeReview(
  tx: WriteTx,
  hydrated: HydratedReviewReplica,
  predecessor: ReviewPredecessor,
  operation: PrivateSourceRetirement
): Promise<number> {
  for (const asset of hydrated.assets) {
    if (asset.reusePublished) continue;
    await tx.objectStore(ASSET_REFS_STORE).put(asset.ref);
    await tx.objectStore(ASSET_OWNERS_STORE).put({
      assetId: asset.ref.assetId,
      ownerKind: 'project-asset',
      ownerId: asset.entry.id,
      role: 'body',
    });
    await tx.objectStore(PROJECT_ASSETS_STORE).put(asset.entry);
    if (asset.videoReview) await publishSnapshot(tx, asset.videoReview, null);
  }
  const revision = await publishSnapshot(
    tx,
    hydrated.review,
    predecessor.workspace ? { workspace: predecessor.workspace, draft: predecessor.draft } : null
  );
  await tx.objectStore(THUMBNAILS_STORE).delete(hydrated.review.workspace.aggregateId);
  if (hydrated.thumbnail) await tx.objectStore(THUMBNAILS_STORE).put(hydrated.thumbnail);
  const retained = collectReviewAssetReferences(hydrated.review.workspace);
  await enqueuePrivateSourceRetirement(
    tx,
    [...(predecessor.workspace ? collectReviewAssetReferences(predecessor.workspace) : [])]
      .filter((reference) => !retained.has(reference))
      .map((reference) => reference.slice('project-asset:'.length)),
    operation
  );
  return revision;
}

async function publishReviewProvenance(
  tx: WriteTx,
  input: ApplyPreparedVideoReviewReplicaInput,
  aggregateId: string,
  revision: number,
  operation: PrivateSourceRetirement
): Promise<number> {
  const frozen = await freezeVideoReviewInTransaction(tx, aggregateId);
  const generation = input.expectedLocalGeneration + 1;
  const now = Date.now();
  const state: SyncCaptureRootState = {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', rootKey(input)]),
    rootKey: rootKey(input),
    rootId: aggregateId,
    rootKind: 'video-review',
    spaceId: input.spaceId,
    createdAt: now,
    generation,
    basis: [input.operationId],
    nativeDigest: digestCapturedVideoReviewRows(frozen),
    nativeRevision: revision,
  };
  const applied: SyncCaptureAppliedOperation = {
    version: 1,
    kind: 'applied-operation',
    key: JSON.stringify(['applied-operation', input.spaceId, input.operationId]),
    createdAt: now,
    spaceId: input.spaceId,
    operationId: input.operationId,
    rootKey: rootKey(input),
    sourceDigest: input.sourceDigest,
    generation,
  };
  if (!parseSyncCaptureRecord(state) || !parseSyncCaptureRecord(applied)) refused();
  if (operation.privateSources?.length) await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
  await tx.objectStore(SYNC_CAPTURE_STORE).put(state);
  await tx.objectStore(SYNC_CAPTURE_STORE).add(applied);
  return generation;
}

/** Apply a verified prepared review through one native transaction; receipt replay precedes binary reads. */
export async function applyPreparedVideoReviewReplica(
  input: ApplyPreparedVideoReviewReplicaInput,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<{ status: 'applied' | 'duplicate'; generation: number }> {
  const staged = parseApplyPreparedVideoReviewReplicaInput(input);
  if (!staged) refused();
  const db = await initDB();
  const read = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  await profile(read, staged, false);
  const replay = await receipt(read, staged);
  await read.done;
  if (replay !== null) return { status: 'duplicate', generation: replay };
  const hydrated = await hydratePreparedVideoReviewReplicaRoot(staged.root);
  const operation = buildPhysicalDeleteOperation([]);
  const result = await runWithIndexedDbMutation(async (database) => {
    const tx = database.transaction(
      [
        AGGREGATE_PRESENTATIONS_STORE,
        IMAGE_WORKSPACES_STORE,
        STORE_NAME,
        RECORDING_TELEMETRY_STORE,
        SYNC_CAPTURE_STORE,
        SYNC_CONNECTION_STORE,
        MEDIA_LIBRARY_STORE,
        PROJECT_ASSETS_STORE,
        PROJECT_EXPORTS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_HISTORY_STORE,
        VIDEO_WORKSPACE_DRAFTS_STORE,
        THUMBNAILS_STORE,
      ],
      'readwrite',
      { durability: 'strict' }
    );
    try {
      await profile(tx, staged, false);
      const duplicate = await receipt(tx, staged);
      if (duplicate !== null) {
        await tx.done;
        return { status: 'duplicate' as const, generation: duplicate };
      }
      if (staged.authorization !== undefined)
        await checkSyncConnectionAdmission(tx, staged, staged.authorization);
      await profile(tx, staged, true);
      const predecessor = await ownPredecessor(tx, staged);
      await admitDependencies(tx, staged);
      await admitAssets(tx, staged);
      const revision = await publishNativeReview(tx, hydrated, predecessor, operation);
      const generation = await publishReviewProvenance(
        tx,
        staged,
        hydrated.review.workspace.aggregateId,
        revision,
        operation
      );
      await tx.done;
      return { status: 'applied' as const, generation };
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
  if (operation.privateSources?.length)
    await completePhysicalDeleteOperation(operation, lifecyclePermit).catch(() => undefined);
  return result;
}
