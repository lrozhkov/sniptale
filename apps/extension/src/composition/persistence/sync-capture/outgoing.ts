import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetRef } from '../assets/contracts';
import { initDB } from '../infrastructure/indexed-db/core';
import { SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE } from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  type CaptureOperation,
  type CapturedChange,
  type PreparedCaptureOperation,
} from './contracts';
import { parseCaptureObjectBindings, parseSyncCaptureRecord } from './guards';

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

type PreparedIdentity = Omit<PreparedOutgoingOperation, 'recordText' | 'recordSha256' | 'objects'>;

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
  const objects = parseCaptureObjectBindings(value['objects']);
  if (!objects) return null;
  return { ...identity, recordText, recordSha256, objects };
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
  if (capture.phase !== 'native')
    return (
      capture.phase === 'prepared' &&
      JSON.stringify(record) === JSON.stringify(projectPreparedOperation(capture))
    );
  // The workflow verifies inline Blob copies against the authoritative native inventory.
  if (capture.change.kind === 'image' || capture.change.kind === 'video-project') return true;
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

/** First accepted encoding replaces native rows atomically; every retry returns those bytes. */
export async function commitPreparedOutgoingOperation(
  expectedCapture: unknown,
  draft: unknown
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
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readwrite');
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
      const { change: _change, phase: _phase, ...header } = current;
      const operation: PreparedCaptureOperation = {
        ...header,
        phase: 'prepared',
        prepared: {
          recordText: proposed.recordText,
          recordSha256: proposed.recordSha256,
          objects: proposed.objects,
        },
      };
      if (!parseSyncCaptureRecord(operation))
        throw new Error('Invalid accepted outgoing operation.');
      await captures.put(operation);
      await tx.objectStore(SYNC_OUTBOX_STORE).put({
        key: proposed.key,
        kind: 'operation-locator',
        captureKey: operation.key,
        spaceId: operation.spaceId,
        operationId: operation.operationId,
        profileCreatedAt: operation.profileCreatedAt,
        connectionGeneration: operation.connectionGeneration,
        sourceSha256: operation.sourceSha256,
      });
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

/** Reload the authoritative immutable native slots under the exact retained operation lifetime. */
export async function loadNativeOutgoingCapture(expected: unknown): Promise<CapturedChange> {
  const requested = parseSyncCaptureRecord(expected);
  if (!requested || requested.kind !== 'sync-operation' || requested.phase !== 'native')
    throw new Error('Invalid native outgoing capture.');
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  const current = parseSyncCaptureRecord(
    await tx.objectStore(SYNC_CAPTURE_STORE).get(requested.key)
  );
  await tx.done;
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
