import type { IDBPTransaction } from 'idb';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
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
import { digestCapturedMediaRows } from './freeze';

type ApplyTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;

export interface ApplyPreparedMediaReplicaInput {
  rows: CapturedMediaRows;
  operationId: string;
  sourceDigest: string;
  connectionGeneration: number;
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
    input.expectedLocalGeneration !== 0 ||
    rows.media.lifecycle?.storageClass !== 'library' ||
    rows.media.lifecycle.trashedAt !== undefined ||
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
  identity: ReplicaIdentity
): Promise<void> {
  for (const [store, key] of [
    [SYNC_CAPTURE_STORE, identity.stateKey],
    [MEDIA_LIBRARY_STORE, rows.media.id],
    [PROJECT_ASSETS_STORE, rows.projectAsset.id],
  ] as const) {
    if ((await tx.objectStore(store).get(key)) !== undefined)
      throw new MediaReplicaConflictError('source-changed');
  }
  for (const raw of await tx
    .objectStore(SYNC_CAPTURE_STORE)
    .index('rootKey')
    .getAll(identity.rootKey)) {
    const record = parseSyncCaptureRecord(raw);
    if (!record || record.kind === 'captured-change')
      throw new MediaReplicaConflictError('source-changed');
  }
}

async function assertAbsentSource(
  tx: ApplyTransaction,
  input: ApplyPreparedMediaReplicaInput,
  identity: ReplicaIdentity
): Promise<void> {
  await assertUnclaimedIdentity(tx, input.rows, identity);
  await assertNoSourceSidecars(tx, input.rows.media.id);
  const ref = input.rows.ref;
  const currentRef: unknown = await tx.objectStore(ASSET_REFS_STORE).get(ref.assetId);
  if (currentRef !== undefined && JSON.stringify(parseAssetRef(currentRef)) !== JSON.stringify(ref))
    throw new MediaReplicaConflictError('source-changed');
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
    generation: 1,
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
    generation: 1,
  };
  if (!parseSyncCaptureRecord(state) || !parseSyncCaptureRecord(receipt))
    throw new MediaReplicaConflictError('invalid-input');
  await publishPreparedMediaSourceInTransaction(prepared, stores);
  await publishPreparedMediaProjectChildInTransaction(prepared, stores);
  await tx.objectStore(SYNC_CAPTURE_STORE).add(state);
  await tx.objectStore(SYNC_CAPTURE_STORE).add(receipt);
}

/** Admit a new verified replica; the caller retains staged bytes until this command commits. */
export async function applyPreparedMediaReplica(
  input: ApplyPreparedMediaReplicaInput
): Promise<{ status: 'applied' | 'duplicate'; generation: number }> {
  const candidate = preparedInput(input);
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
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
      if (!profile || profile.kind !== 'profile')
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
      await assertAbsentSource(tx, candidate, identity);
      await publishReplica(tx, candidate, identity);
      await tx.done;
      return { status: 'applied' as const, generation: 1 };
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
}
