import type { AssetOpfsOptions } from '../assets/opfs-store';
import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { IDBPTransaction } from 'idb';
import { parseAssetRef } from '../assets/guards';
import { restoreMissingAssetObject } from '../assets/opfs-residency';
import {
  assetResidencyCopyId,
  type AssetResidencyCopy,
  parseAssetResidencyRecord,
} from '../assets/residency-records';
import {
  readAssetResidencyCopyInTransaction,
  finishAssetResidencyTransitionInTransaction,
} from '../assets/residency';
import { runWithAssetResourceRead } from '../assets/resource-sessions';
import {
  isActivePersistenceMutationTransitionPermit,
  type PersistenceMutationTransitionPermit,
  runWithPersistenceMutationTransition,
  runWithPersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  type SyncConnectionIdentity,
  parseSyncConnectionIdentity,
} from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import type { AssetRef } from '../assets/contracts';
import { initDB } from '../infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_OUTBOX_STORE,
  SYNC_CONNECTION_STORE,
  ASSET_RESIDENCY_STORE,
  ASSET_REFS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  captureProfileBounds,
  type CaptureOperation,
  type CapturedChange,
  type PreparedCaptureOperation,
} from './contracts';
import {
  parseCaptureObjectBindings,
  parseCaptureRetainedBindings,
  parseSyncCaptureRecord,
} from './guards';

const MAX_RECORD_BYTES = 4 * 1024 * 1024;

/** Exact prepared transport bytes and source bindings; capture claims retain their lifetime. */
export interface PreparedOutgoingOperation {
  version: 1;
  key: string;
  createdAt: number;
  spaceId: string;
  connectionGeneration: number;
  captureKey: string;
  captureSha256: string;
  profileCreatedAt: number;
  rootKey: string;
  generation: number;
  operationId: string;
  recordText: string;
  recordSha256: string;
  objects: { objectId: string; ref: AssetRef; sha256: string; filename: string }[];
  retainedObjects?: { objectId: string; remoteKey: string }[];
}

/** The owner computes captureSha256 from the exact normalized retained source. */
export type PreparedOutgoingOperationDraft = Omit<
  PreparedOutgoingOperation,
  'captureSha256' | 'profileCreatedAt'
>;

/** Tuple encoding keeps each space and operation identity independent. */
export function preparedOutgoingOperationKey(spaceId: string, operationId: string): string {
  return JSON.stringify([spaceId, operationId]);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

type PreparedIdentity = Omit<
  PreparedOutgoingOperation,
  'recordText' | 'recordSha256' | 'objects' | 'retainedObjects'
>;

function parseIdentity(value: Record<string, unknown>): PreparedIdentity | null {
  const {
    key,
    createdAt,
    spaceId,
    connectionGeneration,
    captureKey,
    captureSha256,
    profileCreatedAt,
    rootKey,
    generation,
    operationId,
  } = value;
  if (
    value['version'] !== 1 ||
    !boundedString(spaceId, 256) ||
    !boundedString(operationId, 256) ||
    key !== preparedOutgoingOperationKey(spaceId, operationId) ||
    !ordinal(createdAt) ||
    !ordinal(connectionGeneration) ||
    connectionGeneration === 0 ||
    !boundedString(captureKey, 2048) ||
    !digest(captureSha256) ||
    !ordinal(profileCreatedAt) ||
    !boundedString(rootKey, 2048) ||
    !ordinal(generation) ||
    generation === 0
  )
    return null;
  return {
    version: 1,
    key,
    createdAt,
    spaceId,
    connectionGeneration,
    captureKey,
    captureSha256,
    profileCreatedAt,
    rootKey,
    generation,
    operationId,
  };
}

/** Validate retained preparation evidence for sibling dispatch admission. */
export function parsePrepared(value: unknown): PreparedOutgoingOperation | null {
  if (!isRecord(value)) return null;
  const identity = parseIdentity(value);
  const { recordText, recordSha256 } = value;
  if (
    !identity ||
    typeof recordText !== 'string' ||
    recordText.length > MAX_RECORD_BYTES ||
    !digest(recordSha256)
  )
    return null;
  const bytes = new TextEncoder().encode(recordText);
  if (
    bytes.byteLength > MAX_RECORD_BYTES ||
    Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('') !==
      recordSha256
  )
    return null;
  let root: unknown;
  try {
    root = JSON.parse(identity.rootKey);
  } catch {
    return null;
  }
  if (
    !Array.isArray(root) ||
    root.length !== 3 ||
    root[0] !== identity.spaceId ||
    typeof root[1] !== 'string' ||
    !['media', 'video-review', 'video-project', 'scenario-project'].includes(root[1]) ||
    !boundedString(root[2], 256) ||
    JSON.stringify(root) !== identity.rootKey
  )
    return null;
  const rootKind: unknown = root[1];
  const objects = parseCaptureObjectBindings(value['objects'], rootKind);
  const retainedObjects = Object.hasOwn(value, 'retainedObjects')
    ? parseCaptureRetainedBindings(value['retainedObjects'], rootKind)
    : undefined;
  if (
    !objects ||
    retainedObjects === null ||
    objects.length + (retainedObjects?.length ?? 0) > captureProfileBounds(rootKind).objects ||
    retainedObjects?.some((item) => objects.some((local) => local.objectId === item.objectId))
  )
    return null;
  return {
    ...identity,
    recordText,
    recordSha256,
    objects,
    ...(retainedObjects === undefined ? {} : { retainedObjects }),
  };
}

/** Compare prepared evidence with the complete normalized retained capture. */
export function matchesCapture(
  record: PreparedOutgoingOperation,
  capture: CaptureOperation
): boolean {
  if (
    record.spaceId !== capture.spaceId ||
    record.operationId !== capture.operationId ||
    record.captureKey !== capture.key ||
    record.captureSha256 !== capture.sourceSha256 ||
    record.profileCreatedAt !== capture.profileCreatedAt ||
    record.rootKey !== capture.rootKey ||
    record.generation !== capture.generation ||
    record.connectionGeneration !== capture.connectionGeneration
  )
    return false;
  if (
    capture.phase === 'native' &&
    record.retainedObjects !== undefined &&
    (capture.change.kind !== 'video-project' || record.retainedObjects.length === 0)
  )
    return false;
  if (capture.phase !== 'native')
    return (
      capture.phase === 'prepared' &&
      JSON.stringify(record) === JSON.stringify(projectPreparedOperation(capture))
    );
  // The workflow verifies inline Blob copies against the authoritative native inventory.
  if (
    (capture.change.kind === 'media' && 'webSnapshot' in capture.change.rows) ||
    capture.change.kind === 'image' ||
    capture.change.kind === 'video-project' ||
    capture.change.kind === 'video-review' ||
    capture.change.kind === 'scenario-project'
  )
    return true;
  const refs = capture.change.kind === 'tombstone' ? [] : [capture.change.rows.ref];
  return record.objects.every((item) =>
    refs.some((ref) => JSON.stringify(ref) === JSON.stringify(item.ref))
  );
}

/** Project the one prepared phase into the dispatch API without storing a second payload. */
export function projectPreparedOperation(
  operation: PreparedCaptureOperation
): PreparedOutgoingOperation {
  const prepared = parsePrepared({
    version: 1,
    key: preparedOutgoingOperationKey(operation.spaceId, operation.operationId),
    createdAt: operation.createdAt,
    spaceId: operation.spaceId,
    connectionGeneration: operation.connectionGeneration,
    profileCreatedAt: operation.profileCreatedAt,
    captureKey: operation.key,
    captureSha256: operation.sourceSha256,
    rootKey: operation.rootKey,
    generation: operation.generation,
    operationId: operation.operationId,
    ...operation.prepared,
  });
  if (!prepared) throw new Error('Invalid prepared outgoing operation.');
  return prepared;
}

/** Resolve a compact locator. It carries no payload and grants no dispatch authority. */
export async function readOutgoingOperation(
  tx: import('idb').IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  spaceId: string,
  operationId: string
): Promise<CaptureOperation | null> {
  const locator: unknown = await tx
    .objectStore(SYNC_OUTBOX_STORE)
    .get(preparedOutgoingOperationKey(spaceId, operationId));
  if (locator === undefined) return null;
  if (
    !isRecord(locator) ||
    locator['kind'] !== 'operation-locator' ||
    locator['key'] !== preparedOutgoingOperationKey(spaceId, operationId) ||
    locator['spaceId'] !== spaceId ||
    locator['operationId'] !== operationId ||
    !boundedString(locator['captureKey'], 2048)
  )
    throw new Error('Invalid outgoing operation locator.');
  const operation = parseSyncCaptureRecord(
    await tx.objectStore(SYNC_CAPTURE_STORE).get(locator['captureKey'])
  );
  if (
    !operation ||
    operation.kind !== 'sync-operation' ||
    operation.spaceId !== spaceId ||
    operation.operationId !== operationId ||
    operation.profileCreatedAt !== locator['profileCreatedAt'] ||
    operation.connectionGeneration !== locator['connectionGeneration'] ||
    operation.sourceSha256 !== locator['sourceSha256']
  )
    throw new Error('Invalid outgoing operation.');
  return operation;
}

/** Read the sole accepted portable bytes. Published operations cannot dispatch again. */
export async function loadPreparedOutgoingOperation(
  spaceId: string,
  operationId: string
): Promise<PreparedOutgoingOperation | null> {
  if (!boundedString(spaceId, 256) || !boundedString(operationId, 256))
    throw new Error('Invalid outgoing operation identity.');
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  const operation = await readOutgoingOperation(tx, spaceId, operationId);
  await tx.done;
  return operation?.phase === 'prepared' ? projectPreparedOperation(operation) : null;
}

/** A frozen export reference can retain remote bytes without acquiring local file authority. */
async function admitNativeRetainedExports(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  capture: CapturedChange,
  proposed: PreparedOutgoingOperation,
  authorizationInput: unknown
): Promise<void> {
  const refused = (): never => {
    throw new Error('Native retained export evidence changed.');
  };
  const authorization = parseSyncConnectionIdentity(authorizationInput);
  if (capture.change.kind !== 'video-project' || !authorization) return refused();
  const connection = await checkSyncConnectionAdmission(tx, capture, authorization);
  if (!connection) return refused();
  let wire: unknown;
  try {
    wire = JSON.parse(proposed.recordText);
  } catch {
    return refused();
  }
  if (
    !isRecord(wire) ||
    wire['spaceId'] !== capture.spaceId ||
    wire['operationId'] !== capture.operationId ||
    wire['rootKind'] !== 'video-project' ||
    wire['rootId'] !== capture.rootId ||
    !isRecord(wire['envelope']) ||
    !Array.isArray(wire['objects'])
  )
    return refused();
  const envelope = wire['envelope'];
  const metadata = envelope['metadata'];
  if (
    !isRecord(metadata) ||
    !Array.isArray(metadata['projectExports']) ||
    !Array.isArray(envelope['objects'])
  )
    return refused();
  const rows = capture.change.rows;
  for (const binding of proposed.retainedObjects ?? []) {
    const encoded: unknown = metadata['projectExports'].find(
      (item: unknown) => isRecord(item) && item['objectId'] === binding.objectId
    );
    const descriptor: unknown = envelope['objects'].find(
      (item: unknown) => isRecord(item) && item['objectId'] === binding.objectId
    );
    const digest: unknown = wire['objects'].find(
      (item: unknown) => isRecord(item) && item['objectId'] === binding.objectId
    );
    if (
      !isRecord(encoded) ||
      !isRecord(encoded['entry']) ||
      !isRecord(descriptor) ||
      !isRecord(digest)
    )
      return refused();
    const encodedEntry = encoded['entry'];
    const exported = rows.exports.find((item) => item.id === encodedEntry['id']);
    const ref = exported ? rows.refs.find((item) => item.assetId === exported.assetId) : null;
    if (
      !exported ||
      !ref ||
      encodedEntry['projectId'] !== exported.projectId ||
      encodedEntry['filename'] !== exported.filename ||
      encodedEntry['mimeType'] !== exported.mimeType ||
      encodedEntry['size'] !== exported.size ||
      descriptor['size'] !== ref.size ||
      descriptor['mimeType'] !== ref.mimeType ||
      (ref.sha256 !== null && ref.sha256 !== digest['sha256'])
    )
      return refused();
    const copy = await readAssetResidencyCopyInTransaction(
      tx,
      assetResidencyCopyId({ kind: 'opfs', ref })
    );
    const rawRef: unknown = await tx.objectStore(ASSET_REFS_STORE).get(ref.assetId);
    if (
      !copy ||
      copy.target.kind !== 'opfs' ||
      (copy.phase !== 'unloaded' && copy.phase !== 'unloading') ||
      JSON.stringify(copy.target.ref) !== JSON.stringify(ref) ||
      JSON.stringify(copy.remote.binding) !== JSON.stringify(connection.binding) ||
      copy.remote.key !== binding.remoteKey ||
      copy.remote.sha256 !== digest['sha256'] ||
      (rawRef !== undefined && JSON.stringify(parseAssetRef(rawRef)) !== JSON.stringify(ref))
    )
      return refused();
  }
}

/** First accepted encoding replaces native rows atomically; every retry returns those bytes. */
export async function commitPreparedOutgoingOperation(
  expectedCapture: unknown,
  draft: unknown,
  authorization?: SyncConnectionIdentity
): Promise<PreparedOutgoingOperation> {
  const expected = parseSyncCaptureRecord(structuredClone(expectedCapture));
  const detachedDraft: unknown = structuredClone(draft);
  const proposed =
    expected?.kind === 'sync-operation' && isRecord(detachedDraft)
      ? parsePrepared({
          ...detachedDraft,
          createdAt: expected.createdAt,
          profileCreatedAt: expected.profileCreatedAt,
          captureSha256: expected.sourceSha256,
        })
      : null;
  if (
    !expected ||
    expected.kind !== 'sync-operation' ||
    !proposed ||
    !matchesCapture(proposed, expected)
  )
    throw new Error('Invalid outgoing preparation.');
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        SYNC_CAPTURE_STORE,
        SYNC_OUTBOX_STORE,
        ...(proposed.retainedObjects?.length
          ? [SYNC_CONNECTION_STORE, ASSET_RESIDENCY_STORE, ASSET_REFS_STORE]
          : []),
      ],
      'readwrite'
    );
    try {
      const captures = tx.objectStore(SYNC_CAPTURE_STORE);
      const profile = parseSyncCaptureRecord(await captures.get('profile'));
      const current = parseSyncCaptureRecord(await captures.get(expected.key));
      if (
        !profile ||
        profile.kind !== 'profile' ||
        !profile.enabled ||
        profile.spaceId !== expected.spaceId ||
        profile.connectionGeneration !== expected.connectionGeneration ||
        profile.createdAt !== expected.profileCreatedAt ||
        !current ||
        current.kind !== 'sync-operation' ||
        current.sourceSha256 !== expected.sourceSha256 ||
        current.profileCreatedAt !== expected.profileCreatedAt ||
        current.phase === 'published'
      )
        throw new Error('Outgoing capture changed.');
      if (current.phase === 'prepared') {
        await readOutgoingOperation(tx, current.spaceId, current.operationId);
        const accepted = projectPreparedOperation(current);
        await tx.done;
        return accepted;
      }
      if (JSON.stringify(current) !== JSON.stringify(expected))
        throw new Error('Outgoing capture changed.');
      if (proposed.retainedObjects?.length)
        await admitNativeRetainedExports(tx, current, proposed, authorization);
      const { change: _change, phase: _phase, ...header } = current;
      const operation: PreparedCaptureOperation = {
        ...header,
        phase: 'prepared',
        prepared: {
          recordText: proposed.recordText,
          recordSha256: proposed.recordSha256,
          objects: proposed.objects,
          ...(proposed.retainedObjects === undefined
            ? {}
            : { retainedObjects: proposed.retainedObjects }),
        },
      };
      if (!parseSyncCaptureRecord(operation))
        throw new Error('Invalid accepted outgoing operation.');
      await storePreparedOutgoingInTransaction(tx, operation);
      await tx.done;
      return projectPreparedOperation(operation);
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction can already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

type CaptureReadTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;

async function readNativeOutgoingInTransaction(
  tx: CaptureReadTransaction,
  requested: CapturedChange
): Promise<CapturedChange> {
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  const current = parseSyncCaptureRecord(
    await tx.objectStore(SYNC_CAPTURE_STORE).get(requested.key)
  );
  if (
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    profile.spaceId !== requested.spaceId ||
    profile.createdAt !== requested.profileCreatedAt ||
    profile.connectionGeneration !== requested.connectionGeneration ||
    !current ||
    current.kind !== 'sync-operation' ||
    current.phase !== 'native' ||
    current.operationId !== requested.operationId ||
    current.rootKey !== requested.rootKey ||
    current.profileCreatedAt !== requested.profileCreatedAt ||
    current.connectionGeneration !== requested.connectionGeneration ||
    current.sourceSha256 !== requested.sourceSha256 ||
    JSON.stringify(current) !== JSON.stringify(requested)
  )
    throw new Error('Native outgoing capture changed.');
  return structuredClone(current);
}

/** Reload the authoritative immutable native slots under the exact retained operation lifetime. */
export async function loadNativeOutgoingCapture(expected: unknown): Promise<CapturedChange> {
  const requested = parseSyncCaptureRecord(expected);
  if (!requested || requested.kind !== 'sync-operation' || requested.phase !== 'native')
    throw new Error('Invalid native outgoing capture.');
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  const current = await readNativeOutgoingInTransaction(tx, requested);
  await tx.done;
  return current;
}

/** Return exact frozen OPFS identities, including claims whose native domain owner was deleted. */
export function collectNativeOutgoingAssetRefs(capture: CapturedChange): AssetRef[] {
  const change = capture.change;
  const refs =
    change.kind === 'tombstone'
      ? []
      : change.kind === 'media'
        ? [change.rows.ref, ...('screenshotRef' in change.rows ? [change.rows.screenshotRef] : [])]
        : change.kind === 'image'
          ? [...(change.rows.originalRef ? [change.rows.originalRef] : []), ...change.rows.refs]
          : change.kind === 'video-review'
            ? [change.rows.source.ref, ...change.rows.refs]
            : change.rows.refs;
  const unique = new Map<string, AssetRef>();
  for (const raw of refs) {
    const ref = parseAssetRef(raw);
    if (
      !ref ||
      (unique.has(ref.assetId) && JSON.stringify(unique.get(ref.assetId)) !== JSON.stringify(ref))
    )
      throw new Error('Native outgoing file identity is inconsistent.');
    unique.set(ref.assetId, ref);
  }
  return [...unique.values()];
}

const OUTGOING_RECOVERY_STORES = [
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
  ASSET_RESIDENCY_STORE,
  ASSET_REFS_STORE,
];

async function checkOutgoingRecoveryInTransaction(
  tx: CaptureReadTransaction,
  capture: CapturedChange,
  copy: AssetResidencyCopy,
  authorization: SyncConnectionIdentity
) {
  if (copy.target.kind !== 'opfs') throw new Error('Outgoing recovery requires an OPFS file.');
  const ref = copy.target.ref;
  if (
    !collectNativeOutgoingAssetRefs(capture).some(
      (claimed) => JSON.stringify(claimed) === JSON.stringify(ref)
    )
  )
    throw new Error('Outgoing capture does not own this file.');
  await readNativeOutgoingInTransaction(tx, capture);
  const connection = await checkSyncConnectionAdmission(tx, capture, authorization);
  const currentCopy = await readAssetResidencyCopyInTransaction(tx, copy.id);
  const completed = { ...copy, revision: copy.revision + 1, phase: 'resident' };
  const rawRef: unknown = await tx.objectStore(ASSET_REFS_STORE).get(ref.assetId);
  if (
    !connection ||
    JSON.stringify(connection.binding) !== JSON.stringify(copy.remote.binding) ||
    (JSON.stringify(currentCopy) !== JSON.stringify(copy) &&
      JSON.stringify(currentCopy) !== JSON.stringify(completed)) ||
    (rawRef !== undefined && JSON.stringify(parseAssetRef(rawRef)) !== JSON.stringify(ref))
  )
    throw new Error('Outgoing file recovery source changed.');
}

/** Check a missing frozen file before network IO; native installation repeats these checks. */
export async function loadNativeOutgoingRecoveryCopy(input: {
  capture: unknown;
  ref: unknown;
  authorization: unknown;
}) {
  const capture = parseSyncCaptureRecord(structuredClone(input.capture));
  const ref = parseAssetRef(input.ref);
  const authorization = parseSyncConnectionIdentity(input.authorization);
  if (
    !capture ||
    capture.kind !== 'sync-operation' ||
    capture.phase !== 'native' ||
    !ref ||
    !authorization
  )
    throw new Error('Invalid outgoing file recovery.');
  const db = await initDB();
  const tx = db.transaction(OUTGOING_RECOVERY_STORES, 'readonly');
  const copy = await readAssetResidencyCopyInTransaction(
    tx,
    assetResidencyCopyId({ kind: 'opfs', ref })
  );
  if (
    !copy ||
    copy.target.kind !== 'opfs' ||
    (copy.phase !== 'unloaded' && copy.phase !== 'unloading') ||
    JSON.stringify(copy.target.ref) !== JSON.stringify(ref)
  )
    throw new Error('Outgoing file recovery is unavailable.');
  await checkOutgoingRecoveryInTransaction(tx, capture, copy, authorization);
  await tx.done;
  return copy;
}

/** Restore only files still owned by this exact native capture; never recreate deleted domain rows. */
export async function restoreNativeOutgoingAsset(
  input: {
    capture: unknown;
    copy: unknown;
    authorization: unknown;
    sourceBlob: Blob;
    signal?: AbortSignal;
  },
  options: AssetOpfsOptions = {}
): Promise<'installed' | 'already-present' | 'busy'> {
  const capture = parseSyncCaptureRecord(structuredClone(input.capture));
  const copy = parseAssetResidencyRecord(structuredClone(input.copy));
  const authorization = parseSyncConnectionIdentity(input.authorization);
  if (
    !capture ||
    capture.kind !== 'sync-operation' ||
    capture.phase !== 'native' ||
    !authorization ||
    !copy ||
    copy.kind !== 'copy' ||
    copy.target.kind !== 'opfs' ||
    (copy.phase !== 'unloaded' && copy.phase !== 'unloading')
  )
    throw new Error('Invalid outgoing file recovery.');
  const ref = copy.target.ref;
  const db = await initDB();
  const check = async (tx: CaptureReadTransaction) => {
    input.signal?.throwIfAborted();
    await checkOutgoingRecoveryInTransaction(tx, capture, copy, authorization);
    input.signal?.throwIfAborted();
  };
  const restore = (transition: PersistenceMutationTransitionPermit) =>
    runWithAssetResourceRead(async () => {
      const assertCurrent = async () => {
        const tx = db.transaction(OUTGOING_RECOVERY_STORES, 'readonly');
        await check(tx);
        await tx.done;
      };
      const installed = await restoreMissingAssetObject(
        {
          ref,
          sourceBlob: input.sourceBlob,
          sha256: copy.remote.sha256,
          operationId: copy.operationId,
          ...(input.signal ? { signal: input.signal } : {}),
          assertCurrent,
        },
        { ...options, persistenceTransitionPermit: transition }
      );
      if (installed === 'busy') return installed;
      await runWithPersistenceMutationPermit(async (permit) => {
        const tx = db.transaction(OUTGOING_RECOVERY_STORES, 'readwrite');
        try {
          await check(tx);
          await finishAssetResidencyTransitionInTransaction(tx, copy, 'resident', permit);
          await tx.done;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* The transaction can already be closed. */
          }
          await tx.done.catch(() => undefined);
          throw error;
        }
      });
      return installed;
    });
  const transition = options.persistenceTransitionPermit;
  if (transition !== undefined) {
    if (!isActivePersistenceMutationTransitionPermit(transition))
      throw new Error('Outgoing recovery transition is not active.');
    return restore(transition);
  }
  return runWithPersistenceMutationTransition(restore);
}

/** Persist the sole prepared payload and compact locator in the caller's admitted transaction. */
export async function storePreparedOutgoingInTransaction(
  tx: import('idb').IDBPTransaction<unknown, string[], 'readwrite'>,
  operation: PreparedCaptureOperation
): Promise<void> {
  const checked = parseSyncCaptureRecord(operation);
  if (!checked || checked.kind !== 'sync-operation' || checked.phase !== 'prepared')
    throw new Error('Invalid prepared outgoing operation.');
  const prepared = projectPreparedOperation(checked);
  await tx.objectStore(SYNC_CAPTURE_STORE).put(checked);
  await tx.objectStore(SYNC_OUTBOX_STORE).put({
    key: prepared.key,
    kind: 'operation-locator',
    captureKey: checked.key,
    spaceId: checked.spaceId,
    operationId: checked.operationId,
    profileCreatedAt: checked.profileCreatedAt,
    connectionGeneration: checked.connectionGeneration,
    sourceSha256: checked.sourceSha256,
  });
}
