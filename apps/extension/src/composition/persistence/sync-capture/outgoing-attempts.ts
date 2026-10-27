import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { initDB } from '../infrastructure/indexed-db/core';
import { SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE } from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseSyncCaptureRecord } from './guards';
import { matchesCapture, parsePrepared, type PreparedOutgoingOperation } from './outgoing';

const MAX_RECORD_BYTES = 4 * 1024 * 1024;

/** Immutable physical dispatch evidence. Local capture claims retain every source. */
export interface OutgoingDispatchAttempt {
  version: 1;
  kind: 'dispatch-attempt';
  key: string;
  createdAt: number;
  spaceId: string;
  operationId: string;
  connectionGeneration: number;
  attemptId: string;
  preparedSha256: string;
  recordText: string;
  recordSha256: string;
  recordKey: string;
  objects: { objectId: string; remoteKey: string }[];
}

/** The persistence owner supplies the storage identity and acceptance time. */
export type OutgoingDispatchAttemptDraft = Omit<
  OutgoingDispatchAttempt,
  'kind' | 'key' | 'createdAt'
>;

function bounded(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value)
  );
}

function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
}

function relativeKey(value: unknown): value is string {
  return (
    bounded(value, 2048) &&
    !/[\\?#:]/u.test(value) &&
    Array.from(value).every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127
    ) &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function attemptKey(spaceId: string, operationId: string, attemptId: string): string {
  return JSON.stringify(['dispatch-attempt', spaceId, operationId, attemptId]);
}

function parseObjects(value: unknown): OutgoingDispatchAttempt['objects'] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const objects: OutgoingDispatchAttempt['objects'] = [];
  for (const item of value) {
    if (!isRecord(item) || !bounded(item['objectId'], 256) || !relativeKey(item['remoteKey']))
      return null;
    objects.push({ objectId: item['objectId'], remoteKey: item['remoteKey'] });
  }
  if (
    new Set(objects.map((item) => item.objectId)).size !== objects.length ||
    new Set(objects.map((item) => item.remoteKey)).size !== objects.length
  )
    return null;
  return objects;
}

function parseAttempt(value: unknown): OutgoingDispatchAttempt | null {
  if (!isRecord(value)) return null;
  const {
    spaceId,
    operationId,
    connectionGeneration,
    attemptId,
    createdAt,
    recordText,
    recordSha256,
    preparedSha256,
    recordKey,
  } = value;
  if (
    value['version'] !== 1 ||
    value['kind'] !== 'dispatch-attempt' ||
    !bounded(spaceId, 256) ||
    !bounded(operationId, 256) ||
    !uuid(attemptId) ||
    value['key'] !== attemptKey(spaceId, operationId, attemptId) ||
    typeof connectionGeneration !== 'number' ||
    !Number.isSafeInteger(connectionGeneration) ||
    connectionGeneration < 1 ||
    typeof createdAt !== 'number' ||
    !Number.isSafeInteger(createdAt) ||
    createdAt < 0 ||
    !digest(preparedSha256) ||
    !digest(recordSha256) ||
    !relativeKey(recordKey) ||
    typeof recordText !== 'string' ||
    recordText.length > MAX_RECORD_BYTES
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
  if (!objects || objects.some((item) => item.remoteKey === recordKey)) return null;
  return {
    version: 1,
    kind: 'dispatch-attempt',
    key: value['key'],
    createdAt,
    spaceId,
    operationId,
    connectionGeneration,
    attemptId,
    preparedSha256,
    recordText,
    recordSha256,
    recordKey,
    objects,
  };
}

function matchesPrepared(
  attempt: OutgoingDispatchAttempt,
  prepared: PreparedOutgoingOperation
): boolean {
  return (
    attempt.spaceId === prepared.spaceId &&
    attempt.operationId === prepared.operationId &&
    attempt.connectionGeneration === prepared.connectionGeneration &&
    attempt.preparedSha256 === prepared.recordSha256 &&
    attempt.objects.length === prepared.objects.length &&
    attempt.objects.every((item) =>
      prepared.objects.some((source) => source.objectId === item.objectId)
    )
  );
}

/** Read validated evidence. This read does not authorize a new network dispatch. */
export async function loadOutgoingDispatchAttempt(
  spaceId: string,
  operationId: string,
  attemptId: string
): Promise<OutgoingDispatchAttempt | null> {
  if (!bounded(spaceId, 256) || !bounded(operationId, 256) || !uuid(attemptId))
    throw new Error('Invalid outgoing dispatch identity.');
  const db = await initDB();
  const tx = db.transaction([SYNC_OUTBOX_STORE], 'readonly');
  const raw: unknown = await tx
    .objectStore(SYNC_OUTBOX_STORE)
    .get(attemptKey(spaceId, operationId, attemptId));
  await tx.done;
  if (raw === undefined) return null;
  const accepted = parseAttempt(raw);
  if (
    !accepted ||
    accepted.spaceId !== spaceId ||
    accepted.operationId !== operationId ||
    accepted.attemptId !== attemptId
  )
    throw new Error('Invalid outgoing dispatch attempt.');
  return accepted;
}

/** Admit exact physical bytes before dispatch; contradictory attempt reuse always refuses. */
export async function commitOutgoingDispatchAttempt(
  expectedPrepared: unknown,
  draft: unknown
): Promise<{ attempt: OutgoingDispatchAttempt; created: boolean }> {
  const expected = parsePrepared(structuredClone(expectedPrepared));
  const detached: unknown = structuredClone(draft);
  const proposed =
    isRecord(detached) &&
    bounded(detached['spaceId'], 256) &&
    bounded(detached['operationId'], 256) &&
    uuid(detached['attemptId'])
      ? parseAttempt({
          ...detached,
          kind: 'dispatch-attempt',
          key: attemptKey(detached['spaceId'], detached['operationId'], detached['attemptId']),
          createdAt: Date.now(),
        })
      : null;
  if (!expected || !proposed || !matchesPrepared(proposed, expected))
    throw new Error('Invalid outgoing dispatch preparation.');
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readwrite');
    try {
      const captures = tx.objectStore(SYNC_CAPTURE_STORE);
      const profile = parseSyncCaptureRecord(await captures.get('profile'));
      const capture = parseSyncCaptureRecord(await captures.get(expected.captureKey));
      const store = tx.objectStore(SYNC_OUTBOX_STORE);
      const current = parsePrepared(await store.get(expected.key));
      if (
        !profile ||
        profile.kind !== 'profile' ||
        !profile.enabled ||
        profile.spaceId !== expected.spaceId ||
        profile.connectionGeneration !== expected.connectionGeneration ||
        !current ||
        JSON.stringify(current) !== JSON.stringify(expected) ||
        !capture ||
        capture.kind !== 'captured-change' ||
        !matchesCapture(current, capture)
      )
        throw new Error('Outgoing dispatch evidence changed.');
      const raw: unknown = await store.get(proposed.key);
      const accepted = raw === undefined ? proposed : parseAttempt(raw);
      if (
        !accepted ||
        JSON.stringify({ ...accepted, createdAt: proposed.createdAt }) !== JSON.stringify(proposed)
      )
        throw new Error('Contradictory outgoing dispatch attempt.');
      if (raw === undefined) await store.add(accepted);
      await tx.done;
      return { attempt: accepted, created: raw === undefined };
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
