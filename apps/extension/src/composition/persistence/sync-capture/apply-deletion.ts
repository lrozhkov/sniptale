import { deleteScenarioAggregateInTransaction } from '../scenario/aggregate-cleanup';
import { createScenarioProjectStore } from '../scenario/storage';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import {
  SCENARIO_CAPTURE_STORES,
  freezeScenarioInTransaction,
  digestCapturedScenarioRows,
} from './scenario-snapshot';
import { parsePreparedScenarioReplicaRoot } from './prepared-scenario';
import { readWorkspaceStorage, createVideoWorkspaceStore } from '../review-workspaces/storage';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { collectReviewAssetReferences } from '../review-workspaces/asset-refs';
import { enqueuePrivateSourceRetirement } from '../assets/private-source-retention';
import { freezeVideoReviewInTransaction, digestCapturedVideoReviewRows } from './review-snapshot';
import { parsePreparedVideoReviewReplicaRoot } from './prepared-review';
import { parsePreparedVideoProjectReplicaRoot } from './prepared-project';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { freezeImageInTransaction, digestCapturedImageRows } from './image-snapshot';
import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  initDB,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  RECORDING_RECOVERY_SESSIONS_STORE,
  RECORDING_RECOVERY_BLOCKS_STORE,
  SYNC_CAPTURE_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  WEB_SNAPSHOTS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_OPERATIONS_STORE,
  VIDEO_PROJECTS_STORE,
  VIDEO_PROJECT_REVISIONS_STORE,
  SCENARIO_ASSETS_STORE,
  IMAGE_WORKSPACES_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  THUMBNAILS_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
} from '../infrastructure/indexed-db/core';
import {
  runWithPersistenceMutationTransition,
  runWithPersistenceMutationPermit,
  runWithDurableAssetLifecycleLock,
} from '../infrastructure/mutation-barrier';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  listReadyJournals,
  type AssetReadyJournal,
} from '../assets';
import { tryAssetResourceCleanup } from '../assets/resource-sessions';
import { assertStandaloneMediaSourceReplaceable } from '../projects/source-admission';
import { deleteVideoProjectInTransaction } from '../projects/index.delete';
import { parseVideoProjectEntry } from '../projects/read-guards';
import {
  deleteMediaSidecars,
  releaseMediaSource,
  mediaHasPendingPublication,
} from '../media-library/delete-cascade.sources';
import {
  captureRootKey,
  type CaptureRootKind,
  type SyncCaptureRootState,
  type SyncCaptureAppliedOperation,
} from './contracts';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import { isSupportedCaptureProject, parseSyncCaptureRecord } from './guards';
import { digestCapturedMediaRows, freezeMediaInTransaction } from './freeze';

type Transaction = IDBPTransaction<unknown, string[], 'readwrite'>;

/** Target-local predecessor checked against a selected remote tombstone before this command. */
export interface ApplyCatalogDeletionInput {
  rootKind: CaptureRootKind;
  rootId: string;
  operationId: string;
  sourceDigest: string;
  spaceId: string;
  profileCreatedAt: number;
  connectionGeneration: number;
  expectedLocalGeneration: number;
  expectedBasis: readonly string[];
  expectedWorkspaceRevision: number | null;
}

function refuse(): never {
  throw new Error('Incoming deletion refused: native predecessor changed or retained.');
}
function ordinal(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}
function prepare(input: ApplyCatalogDeletionInput): ApplyCatalogDeletionInput {
  if (
    !['media', 'video-project', 'video-review', 'scenario-project'].includes(input.rootKind) ||
    !input.rootId ||
    input.rootId.length > 256 ||
    !input.spaceId ||
    input.spaceId.length > 256 ||
    !input.operationId ||
    input.operationId.length > 256 ||
    !/^[a-f0-9]{64}$/u.test(input.sourceDigest) ||
    !ordinal(input.profileCreatedAt) ||
    !ordinal(input.connectionGeneration) ||
    input.connectionGeneration === 0 ||
    !ordinal(input.expectedLocalGeneration) ||
    !Array.isArray(input.expectedBasis) ||
    input.expectedBasis.length !== (input.expectedLocalGeneration === 0 ? 0 : 1) ||
    input.expectedBasis.some((id) => typeof id !== 'string' || !id || id.length > 256) ||
    (input.expectedWorkspaceRevision !== null && !ordinal(input.expectedWorkspaceRevision))
  )
    refuse();
  return structuredClone(input);
}

function pendingProject(journal: AssetReadyJournal, id: string): boolean {
  if (journal.domain !== 'sync-replica') return false;
  const payload = journal.payload;
  if (!isRecord(payload)) return true;
  if (payload['kind'] === 'video-review') {
    try {
      parsePreparedVideoReviewReplicaRoot(
        payload['input'] && isRecord(payload['input']) ? payload['input']['root'] : null
      );
      return false;
    } catch {
      return true;
    }
  }
  if (payload['kind'] === 'media') return false;
  if (payload['kind'] !== 'video-project' || !isRecord(payload['input'])) return true;
  const root = payload['input']['root'];
  if (!isRecord(root) || !isRecord(root['entry'])) return true;
  const rootId = root['entry']['id'];
  return typeof rootId !== 'string' || !rootId || rootId === id;
}

async function assertCausalState(
  tx: Transaction,
  input: ApplyCatalogDeletionInput,
  rootKey: string
) {
  const key = JSON.stringify(['root-state', rootKey]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
  const state = raw === undefined ? null : parseSyncCaptureRecord(raw);
  if (raw !== undefined && (!state || state.kind !== 'root-state')) refuse();
  if (
    state?.kind === 'root-state' &&
    (state.key !== key || state.rootKey !== rootKey || state.spaceId !== input.spaceId)
  )
    refuse();
  if (
    (state?.kind === 'root-state' ? state.generation : 0) !== input.expectedLocalGeneration ||
    JSON.stringify(state?.kind === 'root-state' ? state.basis : []) !==
      JSON.stringify(input.expectedBasis)
  )
    refuse();
  for (const rawRecord of await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .index('rootKey')
    .getAll(rootKey)) {
    const record = parseSyncCaptureRecord(rawRecord);
    if (!record || (record.kind === 'sync-operation' && record.phase !== 'published')) refuse();
  }
  return state?.kind === 'root-state' ? state : null;
}

async function assertNoWorkspaceSidecars(tx: Transaction, aggregateId: string): Promise<void> {
  for (const store of [
    IMAGE_WORKSPACES_STORE,
    VIDEO_WORKSPACES_STORE,
    VIDEO_WORKSPACE_DRAFTS_STORE,
    THUMBNAILS_STORE,
  ]) {
    if ((await tx.objectStore(store).get(aggregateId)) !== undefined) refuse();
  }
}

async function assertNoWorkspaceHistory(tx: Transaction, aggregateId: string): Promise<void> {
  const keys = await tx
    .objectStore(VIDEO_WORKSPACE_HISTORY_STORE)
    .index('aggregateId')
    .getAllKeys(aggregateId, 1);
  if (keys.length) refuse();
}

async function assertUnclaimedProjectSidecars(tx: Transaction, rootId: string): Promise<void> {
  for (const key of [rootId, `video-project:${rootId}`]) {
    await assertNoWorkspaceSidecars(tx, key);
    await assertNoWorkspaceHistory(tx, key);
  }
  const presentationKey = createAggregatePresentationKey({ id: rootId, kind: 'video-project' });
  if ((await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).get(presentationKey)) !== undefined)
    refuse();
}

async function deleteProjectRoot(
  tx: Transaction,
  input: ApplyCatalogDeletionInput,
  state: SyncCaptureRootState | null,
  operation: ReturnType<typeof buildPhysicalDeleteOperation>
): Promise<void> {
  const raw: unknown = await tx.objectStore(VIDEO_PROJECTS_STORE).get(input.rootId);
  const current = raw === undefined ? null : parseVideoProjectEntry(raw);
  if (
    (raw !== undefined && !current) ||
    (current ? (current.workspaceRevision ?? 0) : null) !== input.expectedWorkspaceRevision ||
    (current && (!state || !isSupportedCaptureProject(current.project))) ||
    (!state &&
      (await tx.objectStore(VIDEO_PROJECT_REVISIONS_STORE).get(input.rootId)) !== undefined)
  )
    refuse();
  if (!current && !state) await assertUnclaimedProjectSidecars(tx, input.rootId);
  await deleteVideoProjectInTransaction(tx, input.rootId, operation);
}

async function deleteScenarioRoot(
  tx: Transaction,
  input: ApplyCatalogDeletionInput,
  state: SyncCaptureRootState | null,
  operation: ReturnType<typeof buildPhysicalDeleteOperation>
): Promise<number> {
  const raw = await createScenarioProjectStore(tx).get(input.rootId);
  const current = raw === undefined ? null : parseScenarioProjectEntry(raw);
  if (
    (raw !== undefined && !current) ||
    (current?.workspaceRevision ?? null) !== input.expectedWorkspaceRevision ||
    (current && (!state || state.deleted))
  )
    refuse();
  if (
    current &&
    state?.nativeDigest !==
      digestCapturedScenarioRows(await freezeScenarioInTransaction(tx, input.rootId))
  )
    refuse();
  if (!current && state && !state.deleted) refuse();
  await deleteScenarioAggregateInTransaction(tx, input.rootId, operation);
  return Math.max(current?.workspaceRevision ?? 0, state?.nativeRevision ?? 0);
}

async function deleteReviewRoot(
  tx: Transaction,
  input: ApplyCatalogDeletionInput,
  state: SyncCaptureRootState | null,
  operation: ReturnType<typeof buildPhysicalDeleteOperation>
): Promise<number> {
  const stored = await readWorkspaceStorage(tx, input.rootId);
  const workspace = stored.logical === undefined ? null : parseVideoWorkspace(stored.logical);
  if (
    (stored.logical !== undefined && !workspace) ||
    (workspace?.revision ?? null) !== input.expectedWorkspaceRevision
  )
    refuse();
  if (!workspace) {
    if (
      state?.nativeDigest ||
      (state && state.deleted !== true) ||
      (await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(input.rootId)) !== undefined
    )
      refuse();
    return state?.nativeRevision ?? 0;
  }
  if (!state || state.deleted === true) refuse();
  const frozen = await freezeVideoReviewInTransaction(tx, input.rootId);
  if (state.nativeDigest !== digestCapturedVideoReviewRows(frozen)) refuse();
  const nativeRevision = Math.max(state.nativeRevision ?? 0, workspace.revision);
  await createVideoWorkspaceStore(tx).delete(input.rootId);
  await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).delete(input.rootId);
  await tx.objectStore(THUMBNAILS_STORE).delete(input.rootId);
  await enqueuePrivateSourceRetirement(
    tx,
    [...collectReviewAssetReferences(workspace)].map((reference) =>
      reference.slice('project-asset:'.length)
    ),
    operation
  );
  return nativeRevision;
}

function pendingReview(journal: AssetReadyJournal, rootId: string): boolean {
  if (journal.domain !== 'sync-replica') return false;
  const payload = journal.payload;
  if (!isRecord(payload) || !isRecord(payload['input'])) return true;
  try {
    if (payload['kind'] === 'video-review') {
      const root = parsePreparedVideoReviewReplicaRoot(payload['input']['root']);
      return (
        root.review.workspace.aggregateId === rootId ||
        root.assets.some((asset) => asset.videoReview?.workspace.aggregateId === rootId)
      );
    }
    if (payload['kind'] === 'video-project')
      return parsePreparedVideoProjectReplicaRoot(payload['input']['root']).assets.some(
        (asset) => asset.videoReview?.workspace.aggregateId === rootId
      );
    return payload['kind'] !== 'media' && payload['kind'] !== 'image';
  } catch {
    return true;
  }
}

async function assertAbsentMediaRoot(
  tx: Transaction,
  rootId: string,
  state: SyncCaptureRootState | null
): Promise<void> {
  if (state?.nativeDigest) refuse();
  // An absent original must not hide a surviving source child or uncaptured sidecar.
  const childId = rootId.startsWith('project-asset:')
    ? rootId.slice('project-asset:'.length)
    : null;
  if (childId && (await tx.objectStore(PROJECT_ASSETS_STORE).get(childId)) !== undefined) refuse();
  if (
    rootId.startsWith('export:') &&
    (await tx.objectStore(PROJECT_EXPORTS_STORE).get(rootId.slice('export:'.length))) !== undefined
  )
    refuse();
  if ((await tx.objectStore(WEB_SNAPSHOTS_STORE).get(rootId)) !== undefined) refuse();
  if (rootId.startsWith('recording:')) {
    const id = rootId.slice('recording:'.length);
    if (
      (await tx.objectStore(STORE_NAME).get(id)) !== undefined ||
      (await tx.objectStore(RECORDING_TELEMETRY_STORE).get(id)) !== undefined
    )
      refuse();
  }
  await assertNoWorkspaceSidecars(tx, rootId);
  for (const kind of ['image', 'video-project', 'scenario'] as const) {
    const key = createAggregatePresentationKey({ id: rootId, kind });
    if ((await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).get(key)) !== undefined) refuse();
  }
  await assertNoWorkspaceHistory(tx, rootId);
}

async function deleteMediaRoot(
  tx: Transaction,
  input: ApplyCatalogDeletionInput,
  state: SyncCaptureRootState | null,
  operation: ReturnType<typeof buildPhysicalDeleteOperation>
): Promise<void> {
  const current: unknown = await tx.objectStore(MEDIA_LIBRARY_STORE).get(input.rootId);
  if (current === undefined) return assertAbsentMediaRoot(tx, input.rootId, state);
  if (!state) refuse();
  const media = parseMediaLibraryEntry(current);
  if (
    media?.source.kind === 'screenshot' ||
    (media?.source.kind === 'stored-asset' &&
      (media.kind === 'image' || media.kind === 'screenshot'))
  ) {
    const image = await freezeImageInTransaction(tx, input.rootId);
    if (
      state.nativeDigest !== digestCapturedImageRows(image) ||
      media.workspaceRevision !== input.expectedWorkspaceRevision
    )
      refuse();
    await assertStandaloneMediaSourceReplaceable(media, tx);
    await deleteMediaSidecars(tx, input.rootId, operation);
    await releaseMediaSource(tx, media, operation);
    return;
  }
  const rows = await freezeMediaInTransaction(tx, input.rootId);
  if (state.nativeDigest !== digestCapturedMediaRows(rows)) refuse();
  await assertStandaloneMediaSourceReplaceable(rows.media, tx);
  await deleteMediaSidecars(tx, input.rootId, operation);
  await releaseMediaSource(tx, rows.media, operation);
}

interface DeletionIdentity {
  rootKey: string;
  receiptKey: string;
}

async function readDeletionReceipt(
  tx: Transaction,
  input: ApplyCatalogDeletionInput,
  identity: DeletionIdentity
): Promise<number | null> {
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(identity.receiptKey);
  if (raw === undefined) return null;
  const receipt = parseSyncCaptureRecord(raw);
  if (
    !receipt ||
    receipt.kind !== 'applied-operation' ||
    receipt.key !== identity.receiptKey ||
    receipt.spaceId !== input.spaceId ||
    receipt.rootKey !== identity.rootKey ||
    receipt.sourceDigest !== input.sourceDigest ||
    receipt.operationId !== input.operationId
  )
    refuse();
  return receipt.generation;
}

function hasPendingPublication(
  input: ApplyCatalogDeletionInput,
  journals: AssetReadyJournal[]
): boolean {
  if (input.rootKind === 'scenario-project')
    return journals.some((journal) => {
      if (journal.domain === 'scenario-html-exports')
        return !isRecord(journal.payload) || journal.payload['projectId'] === input.rootId;
      if (journal.domain === 'scenario-assets')
        return (
          !isRecord(journal.payload) ||
          !isRecord(journal.payload['project']) ||
          journal.payload['project']['id'] === input.rootId
        );
      if (journal.domain !== 'sync-replica') return false;
      const payload = journal.payload;
      if (!isRecord(payload) || !isRecord(payload['input'])) return true;
      if (payload['kind'] !== 'scenario-project') return false;
      try {
        return parsePreparedScenarioReplicaRoot(payload['input']['root']).entry.id === input.rootId;
      } catch {
        return true;
      }
    });
  if (input.rootKind === 'video-review')
    return journals.some((journal) => pendingReview(journal, input.rootId));
  if (input.rootKind === 'video-project')
    return journals.some((journal) => pendingProject(journal, input.rootId));
  const target = {
    id: input.rootId,
    ...(input.rootId.startsWith('recording:')
      ? {
          source: {
            kind: 'recording' as const,
            recordingId: input.rootId.slice('recording:'.length),
          },
        }
      : input.rootId.startsWith('project-asset:')
        ? {
            source: {
              kind: 'project-asset' as const,
              projectAssetId: input.rootId.slice('project-asset:'.length),
            },
          }
        : {}),
  };
  return journals.some((journal) => mediaHasPendingPublication(journal, target));
}

async function admitDeletion(
  tx: Transaction,
  input: ApplyCatalogDeletionInput,
  journals: AssetReadyJournal[]
) {
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    profile.spaceId !== input.spaceId ||
    profile.createdAt !== input.profileCreatedAt
  )
    refuse();
  const identity: DeletionIdentity = {
    rootKey: captureRootKey(input.spaceId, input.rootKind, input.rootId),
    receiptKey: JSON.stringify(['applied-operation', input.spaceId, input.operationId]),
  };
  const duplicate = await readDeletionReceipt(tx, input, identity);
  if (duplicate !== null) return { status: 'duplicate' as const, generation: duplicate };
  if (!profile.enabled || profile.connectionGeneration !== input.connectionGeneration) refuse();
  if (hasPendingPublication(input, journals)) refuse();
  const previous = await assertCausalState(tx, input, identity.rootKey);
  return { status: 'ready' as const, identity, previous };
}

async function writeDeletionProvenance(
  tx: Transaction,
  input: ApplyCatalogDeletionInput,
  identity: DeletionIdentity,
  operation: ReturnType<typeof buildPhysicalDeleteOperation>,
  signal?: AbortSignal,
  nativeRevision?: number
): Promise<number> {
  const generation = input.expectedLocalGeneration + 1;
  const createdAt = Date.now();
  const state: SyncCaptureRootState = {
    version: 1,
    kind: 'root-state',
    key: JSON.stringify(['root-state', identity.rootKey]),
    createdAt,
    spaceId: input.spaceId,
    rootKind: input.rootKind,
    rootId: input.rootId,
    rootKey: identity.rootKey,
    generation,
    basis: [input.operationId],
    deleted: true,
    ...(nativeRevision === undefined ? {} : { nativeRevision }),
  };
  const receipt: SyncCaptureAppliedOperation = {
    version: 1,
    kind: 'applied-operation',
    key: identity.receiptKey,
    createdAt,
    spaceId: input.spaceId,
    rootKey: identity.rootKey,
    operationId: input.operationId,
    sourceDigest: input.sourceDigest,
    generation,
  };
  if (!parseSyncCaptureRecord(state) || !parseSyncCaptureRecord(receipt)) refuse();
  signal?.throwIfAborted();
  await tx.objectStore(SYNC_CAPTURE_STORE).put(state);
  await tx.objectStore(SYNC_CAPTURE_STORE).add(receipt);
  if (operation.assetIds.length || operation.privateSources?.length)
    await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
  return generation;
}

async function commitDeletion(
  db: Awaited<ReturnType<typeof initDB>>,
  input: ApplyCatalogDeletionInput,
  journals: AssetReadyJournal[],
  operation: ReturnType<typeof buildPhysicalDeleteOperation>,
  signal?: AbortSignal
) {
  signal?.throwIfAborted();
  const tx = db.transaction(
    [
      STORE_NAME,
      RECORDING_TELEMETRY_STORE,
      ...SCENARIO_CAPTURE_STORES,
      RECORDING_RECOVERY_SESSIONS_STORE,
      RECORDING_RECOVERY_BLOCKS_STORE,
      SYNC_CAPTURE_STORE,
      MEDIA_LIBRARY_STORE,
      PROJECT_ASSETS_STORE,
      PROJECT_EXPORTS_STORE,
      WEB_SNAPSHOTS_STORE,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      ASSET_OPERATIONS_STORE,
      VIDEO_PROJECTS_STORE,
      VIDEO_PROJECT_REVISIONS_STORE,
      SCENARIO_ASSETS_STORE,
      IMAGE_WORKSPACES_STORE,
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      THUMBNAILS_STORE,
      AGGREGATE_PRESENTATIONS_STORE,
    ],
    'readwrite'
  );
  try {
    const admission = await admitDeletion(tx, input, journals);
    if (admission.status === 'duplicate') {
      await tx.done;
      return admission;
    }
    signal?.throwIfAborted();
    let nativeRevision =
      input.rootKind === 'media' ? admission.previous?.nativeRevision : undefined;
    if (input.rootKind === 'scenario-project')
      nativeRevision = await deleteScenarioRoot(tx, input, admission.previous, operation);
    else if (input.rootKind === 'video-review')
      nativeRevision = await deleteReviewRoot(tx, input, admission.previous, operation);
    else if (input.rootKind === 'video-project')
      await deleteProjectRoot(tx, input, admission.previous, operation);
    else await deleteMediaRoot(tx, input, admission.previous, operation);
    signal?.throwIfAborted();
    const generation = await writeDeletionProvenance(
      tx,
      input,
      admission.identity,
      operation,
      signal,
      nativeRevision
    );
    signal?.throwIfAborted();
    await tx.done;
    return { status: 'applied' as const, generation };
  } catch (error) {
    return abortIndexedDbMutation(tx, error);
  }
}

/** Apply one checked tombstone; existing deletion recovery owns any remaining physical intent. */
export async function applyCatalogDeletionNative(
  input: ApplyCatalogDeletionInput,
  signal?: AbortSignal
) {
  signal?.throwIfAborted();
  const candidate = prepare(input);
  const db = await initDB();
  signal?.throwIfAborted();
  return runWithPersistenceMutationTransition(() =>
    runWithDurableAssetLifecycleLock(async (permit) => {
      signal?.throwIfAborted();
      const operation = buildPhysicalDeleteOperation([]);
      const result = await tryAssetResourceCleanup(async () => {
        signal?.throwIfAborted();
        const journals = await listReadyJournals();
        signal?.throwIfAborted();
        return runWithPersistenceMutationPermit(() =>
          commitDeletion(db, candidate, journals, operation, signal)
        );
      });
      if (!result) refuse();
      if (!signal?.aborted && (operation.assetIds.length || operation.privateSources?.length))
        await completePhysicalDeleteOperation(operation, permit);
      return result;
    })
  );
}
