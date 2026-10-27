import type { IDBPTransaction } from 'idb';
import { sha256 } from '@noble/hashes/sha2.js';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { initDB } from '../infrastructure/indexed-db/core';
import { SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE } from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseSyncCaptureRecord } from './guards';
import {
  matchesCapture,
  parsePrepared,
  preparedOutgoingOperationKey,
  type PreparedOutgoingOperation,
} from './outgoing';

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

interface CompletedOutgoingFile {
  version: 1;
  kind: 'completed-file';
  key: string;
  spaceId: string;
  connectionGeneration: number;
  operationId: string;
  attemptId: string;
  objectId: string;
  attemptSha256: string;
  captureSha256: string;
}

function completionPrefix(spaceId: string, connectionGeneration: number) {
  return `completed-file:${JSON.stringify([spaceId, connectionGeneration])}:`;
}
function completionKey(attempt: OutgoingDispatchAttempt, objectId: string) {
  const identity = JSON.stringify([attempt.operationId, attempt.attemptId, objectId]);
  return `${completionPrefix(attempt.spaceId, attempt.connectionGeneration)}${identity}`;
}
function parseCompletion(value: unknown): CompletedOutgoingFile | null {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    value['kind'] !== 'completed-file' ||
    !bounded(value['spaceId'], 256) ||
    !bounded(value['operationId'], 256) ||
    !uuid(value['attemptId']) ||
    !bounded(value['objectId'], 256) ||
    typeof value['connectionGeneration'] !== 'number' ||
    !Number.isSafeInteger(value['connectionGeneration']) ||
    value['connectionGeneration'] < 1 ||
    !digest(value['attemptSha256']) ||
    !digest(value['captureSha256'])
  )
    return null;
  const completion: CompletedOutgoingFile = {
    version: 1,
    kind: 'completed-file',
    key: '',
    spaceId: value['spaceId'],
    connectionGeneration: value['connectionGeneration'],
    operationId: value['operationId'],
    attemptId: value['attemptId'],
    objectId: value['objectId'],
    attemptSha256: value['attemptSha256'],
    captureSha256: value['captureSha256'],
  };
  const identity = JSON.stringify([
    completion.operationId,
    completion.attemptId,
    completion.objectId,
  ]);
  completion.key = `${completionPrefix(completion.spaceId, completion.connectionGeneration)}${identity}`;
  return value['key'] === completion.key ? completion : null;
}

/** Admit only acknowledged and digest-checked PUT evidence; never alter the frozen attempt. */
export async function commitCompletedOutgoingFile(
  expectedPrepared: unknown,
  expectedAttempt: unknown,
  objectId: string
): Promise<void> {
  const expected = parsePrepared(structuredClone(expectedPrepared));
  const attempt = parseAttempt(structuredClone(expectedAttempt));
  if (
    !expected ||
    !attempt ||
    !matchesPrepared(attempt, expected) ||
    !attempt.objects.some((item) => item.objectId === objectId)
  )
    throw new Error('Invalid completed outgoing file.');
  const proposed: CompletedOutgoingFile = {
    version: 1,
    kind: 'completed-file',
    key: completionKey(attempt, objectId),
    spaceId: attempt.spaceId,
    connectionGeneration: attempt.connectionGeneration,
    operationId: attempt.operationId,
    attemptId: attempt.attemptId,
    objectId,
    attemptSha256: attempt.recordSha256,
    captureSha256: expected.captureSha256,
  };
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readwrite');
    try {
      const captures = tx.objectStore(SYNC_CAPTURE_STORE);
      const store = tx.objectStore(SYNC_OUTBOX_STORE);
      const profile = parseSyncCaptureRecord(await captures.get('profile'));
      const capture = parseSyncCaptureRecord(await captures.get(expected.captureKey));
      const current = parsePrepared(await store.get(expected.key));
      const storedAttempt = parseAttempt(await store.get(attempt.key));
      if (
        !profile ||
        profile.kind !== 'profile' ||
        !profile.enabled ||
        profile.spaceId !== expected.spaceId ||
        profile.connectionGeneration !== expected.connectionGeneration ||
        !capture ||
        capture.kind !== 'captured-change' ||
        !matchesCapture(expected, capture) ||
        !current ||
        JSON.stringify(current) !== JSON.stringify(expected) ||
        !storedAttempt ||
        JSON.stringify(storedAttempt) !== JSON.stringify(attempt)
      )
        throw new Error('Completed outgoing file evidence changed.');
      const raw: unknown = await store.get(proposed.key);
      const old = raw === undefined ? null : parseCompletion(raw);
      if (raw !== undefined && (!old || JSON.stringify(old) !== JSON.stringify(proposed)))
        throw new Error('Contradictory completed outgoing file.');
      if (raw === undefined) await store.add(proposed);
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
}

type CompletionReadTransaction = IDBPTransaction<unknown, string[], 'readonly'>;

async function listConnectionCompletions(
  tx: CompletionReadTransaction,
  spaceId: string,
  connectionGeneration: number
) {
  const prefix = completionPrefix(spaceId, connectionGeneration);
  const rows: unknown[] = await tx
    .objectStore(SYNC_OUTBOX_STORE)
    .getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`), 8193);
  const completions = rows.filter(
    (row) => isRecord(row) && typeof row['key'] === 'string' && row['key'].startsWith(prefix)
  );
  if (completions.length > 8192) throw new Error('Completed outgoing file limit.');
  return completions;
}

async function readCompletedFileJoin(
  tx: CompletionReadTransaction,
  completed: CompletedOutgoingFile,
  preparedCache: Map<string, PreparedOutgoingOperation>,
  attemptCache: Map<string, OutgoingDispatchAttempt>
) {
  const store = tx.objectStore(SYNC_OUTBOX_STORE);
  const preparedKey = preparedOutgoingOperationKey(completed.spaceId, completed.operationId);
  let prepared = preparedCache.get(preparedKey);
  if (!prepared) {
    const candidate = parsePrepared(await store.get(preparedKey));
    if (!candidate) throw new Error('Invalid completed outgoing preparation.');
    const capture = parseSyncCaptureRecord(
      await tx.objectStore(SYNC_CAPTURE_STORE).get(candidate.captureKey)
    );
    if (!capture || capture.kind !== 'captured-change' || !matchesCapture(candidate, capture))
      throw new Error('Invalid completed outgoing capture.');
    prepared = candidate;
    preparedCache.set(preparedKey, prepared);
  }
  const key = attemptKey(completed.spaceId, completed.operationId, completed.attemptId);
  let attempt = attemptCache.get(key);
  if (!attempt) {
    const candidate = parseAttempt(await store.get(key));
    if (!candidate) throw new Error('Invalid completed outgoing attempt.');
    attempt = candidate;
    attemptCache.set(key, attempt);
  }
  if (
    prepared.spaceId !== completed.spaceId ||
    prepared.connectionGeneration !== completed.connectionGeneration ||
    prepared.captureSha256 !== completed.captureSha256 ||
    !matchesPrepared(attempt, prepared) ||
    attempt.recordSha256 !== completed.attemptSha256 ||
    !attempt.objects.some((item) => item.objectId === completed.objectId)
  )
    throw new Error('Invalid completed outgoing file join.');
  return { prepared, attempt, objectId: completed.objectId };
}

/** Read bounded completed-file joins. Consumers must parse manifests and recheck remote bytes. */
export async function loadCompletedOutgoingFiles(spaceId: string, connectionGeneration: number) {
  if (
    !bounded(spaceId, 256) ||
    !Number.isSafeInteger(connectionGeneration) ||
    connectionGeneration < 1
  )
    throw new Error('Invalid completed outgoing file identity.');
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    profile.spaceId !== spaceId ||
    profile.connectionGeneration !== connectionGeneration
  ) {
    await tx.done;
    throw new Error('Completed outgoing file connection changed.');
  }
  const completions = await listConnectionCompletions(tx, spaceId, connectionGeneration);
  const preparedCache = new Map<string, PreparedOutgoingOperation>();
  const attemptCache = new Map<string, OutgoingDispatchAttempt>();
  const result = [];
  for (const raw of completions) {
    const completed = parseCompletion(raw);
    if (
      !completed ||
      completed.spaceId !== spaceId ||
      completed.connectionGeneration !== connectionGeneration
    )
      throw new Error('Invalid completed outgoing file.');
    result.push(await readCompletedFileJoin(tx, completed, preparedCache, attemptCache));
  }
  await tx.done;
  return result;
}
