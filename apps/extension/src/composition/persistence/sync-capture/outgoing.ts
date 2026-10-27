import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { AssetRef } from '../assets/contracts';
import { parseAssetRef } from '../assets/guards';
import { initDB } from '../infrastructure/indexed-db/core';
import { SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE } from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { MAX_CAPTURE_ROWS, type CapturedChange } from './contracts';
import { parseSyncCaptureRecord } from './guards';

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
  rootKey: string;
  generation: number;
  operationId: string;
  recordText: string;
  recordSha256: string;
  attemptKey: string;
  objects: { objectId: string; remoteKey: string; ref: AssetRef; sha256: string }[];
}

/** The owner computes captureSha256 from the exact normalized retained source. */
export type PreparedOutgoingOperationDraft = Omit<PreparedOutgoingOperation, 'captureSha256'>;

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

function relativeKey(value: unknown): value is string {
  return (
    boundedString(value, 2048) &&
    !/[\\?#]/u.test(value) &&
    Array.from(value).every((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    }) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..') &&
    !value.includes(':')
  );
}

function hashText(text: string): string {
  return Array.from(sha256(new TextEncoder().encode(text)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

type PreparedIdentity = Omit<
  PreparedOutgoingOperation,
  'recordText' | 'recordSha256' | 'attemptKey' | 'objects'
>;

function parseIdentity(value: Record<string, unknown>): PreparedIdentity | null {
  const {
    key,
    createdAt,
    spaceId,
    connectionGeneration,
    captureKey,
    captureSha256,
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
    rootKey,
    generation,
    operationId,
  };
}

function parseObjects(value: unknown): PreparedOutgoingOperation['objects'] | null {
  if (!Array.isArray(value) || value.length > MAX_CAPTURE_ROWS * 2) return null;
  const objects: PreparedOutgoingOperation['objects'] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const ref = parseAssetRef(item['ref']);
    if (
      !ref ||
      !boundedString(item['objectId'], 256) ||
      !relativeKey(item['remoteKey']) ||
      !digest(item['sha256']) ||
      (ref.sha256 !== null && ref.sha256 !== item['sha256'])
    )
      return null;
    objects.push({
      objectId: item['objectId'],
      remoteKey: item['remoteKey'],
      ref,
      sha256: item['sha256'],
    });
  }
  if (
    new Set(objects.map((item) => item.objectId)).size !== objects.length ||
    new Set(objects.map((item) => item.remoteKey)).size !== objects.length
  )
    return null;
  return objects;
}

/** Validate retained preparation evidence for sibling dispatch admission. */
export function parsePrepared(value: unknown): PreparedOutgoingOperation | null {
  if (!isRecord(value)) return null;
  const identity = parseIdentity(value);
  const { recordText, recordSha256, attemptKey } = value;
  if (
    !identity ||
    typeof recordText !== 'string' ||
    recordText.length > MAX_RECORD_BYTES ||
    !digest(recordSha256) ||
    !relativeKey(attemptKey)
  )
    return null;
  const bytes = new TextEncoder().encode(recordText);
  if (
    bytes.byteLength > MAX_RECORD_BYTES ||
    Array.from(sha256(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('') !==
      recordSha256
  )
    return null;
  const objects = parseObjects(value['objects']);
  if (!objects) return null;
  return { ...identity, recordText, recordSha256, attemptKey, objects };
}

/** Compare prepared evidence with the complete normalized retained capture. */
export function matchesCapture(
  record: PreparedOutgoingOperation,
  capture: CapturedChange
): boolean {
  if (
    record.spaceId !== capture.spaceId ||
    record.operationId !== capture.operationId ||
    record.captureKey !== capture.key ||
    record.captureSha256 !== hashText(JSON.stringify(capture)) ||
    record.rootKey !== capture.rootKey ||
    record.generation !== capture.generation ||
    record.connectionGeneration !== capture.connectionGeneration
  )
    return false;
  const refs =
    capture.change.kind === 'tombstone'
      ? []
      : capture.change.kind === 'media'
        ? [capture.change.rows.ref]
        : capture.change.rows.refs;
  return record.objects.every((item) =>
    refs.some((ref) => JSON.stringify(ref) === JSON.stringify(item.ref))
  );
}

/** Read validated accepted bytes without repair, profile mutation, or source release. */
export async function loadPreparedOutgoingOperation(
  spaceId: string,
  operationId: string
): Promise<PreparedOutgoingOperation | null> {
  if (!boundedString(spaceId, 256) || !boundedString(operationId, 256))
    throw new Error('Invalid outgoing operation identity.');
  const db = await initDB();
  const tx = db.transaction([SYNC_OUTBOX_STORE], 'readonly');
  const raw: unknown = await tx
    .objectStore(SYNC_OUTBOX_STORE)
    .get(preparedOutgoingOperationKey(spaceId, operationId));
  await tx.done;
  if (raw === undefined) return null;
  const record = parsePrepared(raw);
  if (!record || record.spaceId !== spaceId || record.operationId !== operationId)
    throw new Error('Invalid prepared outgoing operation.');
  return record;
}

/** First accepted materialization wins. Every caller must use the returned accepted value. */
export async function commitPreparedOutgoingOperation(
  expectedCapture: unknown,
  draft: unknown
): Promise<PreparedOutgoingOperation> {
  const expected = parseSyncCaptureRecord(structuredClone(expectedCapture));
  const detachedDraft: unknown = structuredClone(draft);
  const proposed =
    expected && expected.kind === 'captured-change' && isRecord(detachedDraft)
      ? parsePrepared({ ...detachedDraft, captureSha256: hashText(JSON.stringify(expected)) })
      : null;
  if (
    !expected ||
    expected.kind !== 'captured-change' ||
    !proposed ||
    !matchesCapture(proposed, expected)
  )
    throw new Error('Invalid outgoing preparation.');
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readwrite');
    try {
      const captureStore = tx.objectStore(SYNC_CAPTURE_STORE);
      const profile = parseSyncCaptureRecord(await captureStore.get('profile'));
      const current = parseSyncCaptureRecord(await captureStore.get(expected.key));
      if (
        !profile ||
        profile.kind !== 'profile' ||
        !profile.enabled ||
        profile.spaceId !== expected.spaceId ||
        profile.connectionGeneration !== expected.connectionGeneration ||
        !current ||
        current.kind !== 'captured-change' ||
        JSON.stringify(current) !== JSON.stringify(expected)
      )
        throw new Error('Outgoing capture changed.');
      const store = tx.objectStore(SYNC_OUTBOX_STORE);
      const existing: unknown = await store.get(proposed.key);
      const accepted = existing === undefined ? proposed : parsePrepared(existing);
      if (!accepted || !matchesCapture(accepted, current))
        throw new Error('Invalid accepted outgoing operation.');
      if (existing === undefined) await store.add(accepted);
      await tx.done;
      return accepted;
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
}
