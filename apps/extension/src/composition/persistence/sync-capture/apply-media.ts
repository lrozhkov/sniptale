import type { IDBPTransaction } from 'idb';
import type { AssetRef } from '../assets/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { initDB } from '../infrastructure/indexed-db/core';
import type { DurableAssetLifecyclePermit } from '../infrastructure/mutation-barrier';
import { buildPhysicalDeleteOperation, completePhysicalDeleteOperation } from '../assets';
import { assertStandaloneMediaSourceReplaceable } from '../projects/source-admission';
import { releaseMediaSource } from '../media-library/delete-cascade.sources';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  ASSET_OPERATIONS_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  SYNC_CAPTURE_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  IMAGE_WORKSPACES_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  THUMBNAILS_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  publishPreparedMediaSourceInTransaction,
  publishPreparedMediaProjectChildInTransaction,
} from '../media-library/source-publication';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import { parseAssetRef } from '../assets/guards';
import {
  captureRootKey,
  type CapturedMediaRows,
  type SyncCaptureRootState,
  type SyncCaptureAppliedOperation,
} from './contracts';
import { parseCapturedMediaRows, parseSyncCaptureRecord } from './guards';
import { digestCapturedMediaRows, freezeMediaInTransaction } from './freeze';

type ReadTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
type ApplyTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;

export interface ApplyPreparedMediaReplicaInput {
  rows: CapturedMediaRows;
  operationId: string;
  sourceDigest: string;
  connectionGeneration: number;
  spaceId: string;
  profileCreatedAt: number;
  expectedBasis: readonly string[];
  expectedLocalGeneration: number;
}

class MediaReplicaConflictError extends Error {
  constructor(
    readonly code: 'invalid-input' | 'profile-changed' | 'source-changed' | 'receipt-conflict'
  ) {
    super(`Prepared media application refused: ${code}.`);
    this.name = 'MediaReplicaConflictError';
  }
}

function preparedInput(input: ApplyPreparedMediaReplicaInput): ApplyPreparedMediaReplicaInput {
  const rows = parseCapturedMediaRows(input.rows);
  if (
    !rows ||
    !input.operationId ||
    input.operationId.length > 256 ||
    !/^[a-f0-9]{64}$/u.test(input.sourceDigest) ||
    !Number.isSafeInteger(input.connectionGeneration) ||
    input.connectionGeneration < 1 ||
    !Number.isSafeInteger(input.expectedLocalGeneration) ||
    input.expectedLocalGeneration < 0 ||
    !input.spaceId ||
    !Number.isSafeInteger(input.profileCreatedAt) ||
    input.profileCreatedAt < 0 ||
    !Array.isArray(input.expectedBasis) ||
    input.expectedBasis.length !== (input.expectedLocalGeneration === 0 ? 0 : 1) ||
    input.expectedBasis.some((id) => typeof id !== 'string' || !id || id.length > 256) ||
    rows.media.lifecycle?.storageClass !== 'library' ||
    rows.projectAsset.originMediaId
  )
    throw new MediaReplicaConflictError('invalid-input');
  return structuredClone({ ...input, rows });
}

interface ReplicaIdentity {
  rootKey: string;
  stateKey: string;
  receiptKey: string;
  spaceId: string;
}

async function readReceipt(
  tx: ApplyTransaction,
  input: ApplyPreparedMediaReplicaInput,
  identity: ReplicaIdentity
): Promise<number | null> {
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(identity.receiptKey);
  if (raw === undefined) return null;
  const receipt = parseSyncCaptureRecord(raw);
  if (
    !receipt ||
    receipt.kind !== 'applied-operation' ||
    receipt.key !== identity.receiptKey ||
    receipt.spaceId !== identity.spaceId ||
    receipt.rootKey !== identity.rootKey ||
    receipt.operationId !== input.operationId ||
    receipt.sourceDigest !== input.sourceDigest
  )
    throw new MediaReplicaConflictError('receipt-conflict');
  return receipt.generation;
}

async function assertNoSourceSidecars(tx: ApplyTransaction, mediaId: string): Promise<void> {
  for (const store of [
    IMAGE_WORKSPACES_STORE,
    VIDEO_WORKSPACES_STORE,
    VIDEO_WORKSPACE_DRAFTS_STORE,
    THUMBNAILS_STORE,
  ]) {
    if ((await tx.objectStore(store).get(mediaId)) !== undefined)
      throw new MediaReplicaConflictError('source-changed');
  }
  for (const kind of ['image', 'video-project', 'scenario'] as const) {
    const key = createAggregatePresentationKey({ id: mediaId, kind });
    if ((await tx.objectStore(AGGREGATE_PRESENTATIONS_STORE).get(key)) !== undefined)
      throw new MediaReplicaConflictError('source-changed');
  }
  if (
    (
      await tx
        .objectStore(VIDEO_WORKSPACE_HISTORY_STORE)
        .index('aggregateId')
        .getAllKeys(mediaId, 1)
    ).length
  )
    throw new MediaReplicaConflictError('source-changed');
}

async function assertUnclaimedIdentity(
  tx: ApplyTransaction,
  rows: CapturedMediaRows,
  identity: ReplicaIdentity,
  hasGraveyard = false
): Promise<void> {
  for (const [store, key] of [
    [SYNC_CAPTURE_STORE, identity.stateKey],
    [MEDIA_LIBRARY_STORE, rows.media.id],
    [PROJECT_ASSETS_STORE, rows.projectAsset.id],
  ] as const) {
    if (store === SYNC_CAPTURE_STORE && hasGraveyard) continue;
    if ((await tx.objectStore(store).get(key)) !== undefined)
      throw new MediaReplicaConflictError('source-changed');
  }
  for (const raw of await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .index('rootKey')
    .getAll(identity.rootKey)) {
    const record = parseSyncCaptureRecord(raw);
    if (!record || (record.kind === 'sync-operation' && record.phase !== 'published'))
      throw new MediaReplicaConflictError('source-changed');
  }
}

async function assertAbsentSource(
  tx: ApplyTransaction,
  input: ApplyPreparedMediaReplicaInput,
  identity: ReplicaIdentity,
  hasGraveyard = false
): Promise<void> {
  await assertUnclaimedIdentity(tx, input.rows, identity, hasGraveyard);
  await assertNoSourceSidecars(tx, input.rows.media.id);
  const ref = input.rows.ref;
  const currentRef: unknown = await tx.objectStore(ASSET_REFS_STORE).get(ref.assetId);
  if (currentRef !== undefined && JSON.stringify(parseAssetRef(currentRef)) !== JSON.stringify(ref))
    throw new MediaReplicaConflictError('source-changed');
}

async function readMediaPredecessorState(
  tx: ReadTransaction,
  input: Pick<ApplyPreparedMediaReplicaInput, 'expectedLocalGeneration' | 'expectedBasis'>,
  identity: Pick<ReplicaIdentity, 'stateKey' | 'spaceId' | 'rootKey'>
): Promise<SyncCaptureRootState> {
  const state = parseSyncCaptureRecord(
    await tx.objectStore(SYNC_CAPTURE_STORE).get(identity.stateKey)
  );
  if (
    !state ||
    state.kind !== 'root-state' ||
    state.key !== identity.stateKey ||
    state.spaceId !== identity.spaceId ||
    state.rootKey !== identity.rootKey ||
    state.rootKind !== 'media' ||
    captureRootKey(identity.spaceId, 'media', state.rootId) !== identity.rootKey ||
    state.generation !== input.expectedLocalGeneration ||
    JSON.stringify(state.basis) !== JSON.stringify(input.expectedBasis)
  )
    throw new MediaReplicaConflictError('source-changed');
  for (const raw of await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .index('rootKey')
    .getAll(identity.rootKey)) {
    const record = parseSyncCaptureRecord(raw);
    if (!record || (record.kind === 'sync-operation' && record.phase !== 'published'))
      throw new MediaReplicaConflictError('source-changed');
  }
  return state;
}

async function assertExistingSource(
  tx: ApplyTransaction,
  input: ApplyPreparedMediaReplicaInput,
  identity: ReplicaIdentity
): Promise<CapturedMediaRows | null> {
  const state = await readMediaPredecessorState(tx, input, identity);
  if (state.deleted === true) {
    await assertAbsentSource(tx, input, identity, true);
    return null;
  }
  const previous = await freezeMediaInTransaction(tx, input.rows.media.id);
  if (
    state.nativeDigest !== digestCapturedMediaRows(previous) ||
    previous.projectAsset.id !== input.rows.projectAsset.id
  )
    throw new MediaReplicaConflictError('source-changed');
  if (previous.ref.assetId !== input.rows.ref.assetId)
    await assertStandaloneMediaSourceReplaceable(previous.media, tx);
  const ref: unknown = await tx.objectStore(ASSET_REFS_STORE).get(input.rows.ref.assetId);
  if (ref !== undefined && JSON.stringify(parseAssetRef(ref)) !== JSON.stringify(input.rows.ref))
    throw new MediaReplicaConflictError('source-changed');
  return previous;
}

/** Read a candidate immutable original. The native commit must repeat predecessor admission. */
export async function loadMediaReplicaPredecessorRef(input: {
  spaceId: string;
  profileCreatedAt: number;
  connectionGeneration: number;
  mediaId: string;
  expectedLocalGeneration: number;
  expectedBasis: readonly string[];
}): Promise<AssetRef | null> {
  const db = await initDB();
  const tx = db.transaction(
    [
      SYNC_CAPTURE_STORE,
      MEDIA_LIBRARY_STORE,
      PROJECT_ASSETS_STORE,
      ASSET_REFS_STORE,
      IMAGE_WORKSPACES_STORE,
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      THUMBNAILS_STORE,
      AGGREGATE_PRESENTATIONS_STORE,
    ],
    'readonly'
  );
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    profile.spaceId !== input.spaceId ||
    profile.createdAt !== input.profileCreatedAt ||
    profile.connectionGeneration !== input.connectionGeneration
  )
    throw new MediaReplicaConflictError('profile-changed');
  if (
    !Number.isSafeInteger(input.expectedLocalGeneration) ||
    input.expectedLocalGeneration < 0 ||
    input.expectedBasis.length !== (input.expectedLocalGeneration === 0 ? 0 : 1)
  )
    throw new MediaReplicaConflictError('invalid-input');
  if (input.expectedLocalGeneration === 0) {
    await tx.done;
    return null;
  }
  const rootKey = captureRootKey(input.spaceId, 'media', input.mediaId);
  const state = await readMediaPredecessorState(tx, input, {
    rootKey,
    stateKey: JSON.stringify(['root-state', rootKey]),
    spaceId: input.spaceId,
  });
  if (state.deleted) {
    await tx.done;
    return null;
  }
  const media = parseMediaLibraryEntry(
    await tx.objectStore(MEDIA_LIBRARY_STORE).get(input.mediaId)
  );
  if (!media) throw new MediaReplicaConflictError('source-changed');
  if (media.source.kind !== 'project-asset') {
    await tx.done;
    return null;
  }
  const previous = await freezeMediaInTransaction(tx, input.mediaId);
  if (state.nativeDigest !== digestCapturedMediaRows(previous))
    throw new MediaReplicaConflictError('source-changed');
  await tx.done;
  return structuredClone(previous.ref);
}

async function publishReplica(
  tx: ApplyTransaction,
  input: ApplyPreparedMediaReplicaInput,
  identity: ReplicaIdentity
): Promise<void> {
  const { rows } = input;
  const prepared = {
    media: rows.media,
    original: { ref: rows.ref },
    projectAsset: rows.projectAsset,
  };
  const stores = {
    media: tx.objectStore(MEDIA_LIBRARY_STORE),
    refs: tx.objectStore(ASSET_REFS_STORE),
    owners: tx.objectStore(ASSET_OWNERS_STORE),
    projectAssets: tx.objectStore(PROJECT_ASSETS_STORE),
    projectExports: tx.objectStore(PROJECT_EXPORTS_STORE),
  };
  const createdAt = Date.now();
  const state: SyncCaptureRootState = {
    version: 1,
    kind: 'root-state',
    key: identity.stateKey,
    createdAt,
    spaceId: identity.spaceId,
    rootKind: 'media',
    rootId: rows.media.id,
    rootKey: identity.rootKey,
    generation: input.expectedLocalGeneration + 1,
    basis: [input.operationId],
    nativeDigest: digestCapturedMediaRows(rows),
  };
  const receipt: SyncCaptureAppliedOperation = {
    version: 1,
    kind: 'applied-operation',
    key: identity.receiptKey,
    createdAt,
    spaceId: identity.spaceId,
    rootKey: identity.rootKey,
    operationId: input.operationId,
    sourceDigest: input.sourceDigest,
    generation: input.expectedLocalGeneration + 1,
  };
  if (!parseSyncCaptureRecord(state) || !parseSyncCaptureRecord(receipt))
    throw new MediaReplicaConflictError('invalid-input');
  await publishPreparedMediaSourceInTransaction(prepared, stores);
  await publishPreparedMediaProjectChildInTransaction(prepared, stores);
  await tx.objectStore(SYNC_CAPTURE_STORE).put(state);
  await tx.objectStore(SYNC_CAPTURE_STORE).add(receipt);
}

/** Admit a verified original against its exact native predecessor; retain staged bytes until commit. */
export async function applyPreparedMediaReplica(
  input: ApplyPreparedMediaReplicaInput,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<{ status: 'applied' | 'duplicate'; generation: number }> {
  const candidate = preparedInput(input);
  const operation = buildPhysicalDeleteOperation([]);
  const result = await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        ASSET_OPERATIONS_STORE,
        VIDEO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
        SYNC_CAPTURE_STORE,
        MEDIA_LIBRARY_STORE,
        PROJECT_ASSETS_STORE,
        PROJECT_EXPORTS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
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
      const profile = parseSyncCaptureRecord(
        await tx.objectStore(SYNC_CAPTURE_STORE).get('profile')
      );
      if (
        !profile ||
        profile.kind !== 'profile' ||
        profile.spaceId !== candidate.spaceId ||
        profile.createdAt !== candidate.profileCreatedAt
      )
        throw new MediaReplicaConflictError('profile-changed');
      const rootKey = captureRootKey(profile.spaceId, 'media', candidate.rows.media.id);
      const identity: ReplicaIdentity = {
        rootKey,
        spaceId: profile.spaceId,
        stateKey: JSON.stringify(['root-state', rootKey]),
        receiptKey: JSON.stringify(['applied-operation', profile.spaceId, candidate.operationId]),
      };
      const duplicate = await readReceipt(tx, candidate, identity);
      if (duplicate !== null) {
        await tx.done;
        return { status: 'duplicate' as const, generation: duplicate };
      }
      if (!profile.enabled || profile.connectionGeneration !== candidate.connectionGeneration)
        throw new MediaReplicaConflictError('profile-changed');
      if (candidate.expectedLocalGeneration === 0)
        await assertAbsentSource(tx, candidate, identity);
      else {
        const previous = await assertExistingSource(tx, candidate, identity);
        if (previous && previous.ref.assetId !== candidate.rows.ref.assetId)
          await releaseMediaSource(tx, previous.media, operation);
      }
      await publishReplica(tx, candidate, identity);
      if (operation.assetIds.length) await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
      await tx.done;
      return { status: 'applied' as const, generation: candidate.expectedLocalGeneration + 1 };
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
  if (operation.assetIds.length) await completePhysicalDeleteOperation(operation, lifecyclePermit);
  return result;
}
