import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { initDB } from '../infrastructure/indexed-db/core';
import { SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE } from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { PublishedCaptureOperation } from './contracts';
import { parseSyncCaptureRecord } from './guards';
import {
  parsePrepared,
  projectPreparedOperation,
  readOutgoingOperation,
  type PreparedOutgoingOperation,
} from './outgoing';
import {
  matchesOutgoingDispatchPrepared,
  parseOutgoingDispatchAttempt,
  type OutgoingDispatchAttempt,
} from './outgoing-attempts';

/** Compact publication receipt. Historical evidence alone cannot authorize byte release. */
interface VerifiedOutgoingResult {
  version: 1;
  kind: 'verified-outgoing-result';
  publicationKind: 'verified' | 'observed';
  key: string;
  captureKey: string;
  acceptedAt: number;
  spaceId: string;
  connectionGeneration: number;
  profileCreatedAt: number;
  operationId: string;
  captureSha256: string;
  preparedSha256: string;
  attemptId: string;
  attemptKey: string;
  attemptSha256: string;
  remoteManifestKey: string;
}

export function verifiedOutgoingResultKey(
  spaceId: string,
  connectionGeneration: number,
  operationId: string
): string {
  return JSON.stringify(['verified-outgoing-result', spaceId, connectionGeneration, operationId]);
}
function publicationReceipt(operation: PublishedCaptureOperation): VerifiedOutgoingResult {
  return {
    version: 1,
    kind: 'verified-outgoing-result',
    publicationKind: operation.publication.kind,
    key: verifiedOutgoingResultKey(
      operation.spaceId,
      operation.connectionGeneration,
      operation.operationId
    ),
    captureKey: operation.key,
    acceptedAt: operation.publication.acceptedAt,
    spaceId: operation.spaceId,
    connectionGeneration: operation.connectionGeneration,
    profileCreatedAt: operation.profileCreatedAt,
    operationId: operation.operationId,
    captureSha256: operation.sourceSha256,
    preparedSha256: operation.publication.preparedSha256,
    attemptId: operation.publication.attemptId,
    attemptKey: JSON.stringify([
      'dispatch-attempt',
      operation.spaceId,
      operation.operationId,
      operation.publication.attemptId,
    ]),
    attemptSha256: operation.publication.recordSha256,
    remoteManifestKey: operation.publication.recordKey,
  };
}
/** Parse detached receipt values; consumers must compare them with the native published phase. */
export function parseVerifiedOutgoingResult(raw: unknown): VerifiedOutgoingResult | null {
  if (
    !isRecord(raw) ||
    raw['version'] !== 1 ||
    raw['kind'] !== 'verified-outgoing-result' ||
    (raw['publicationKind'] !== 'verified' && raw['publicationKind'] !== 'observed')
  )
    return null;
  const {
    key,
    captureKey,
    spaceId,
    operationId,
    captureSha256,
    preparedSha256,
    attemptId,
    attemptKey,
    attemptSha256,
    remoteManifestKey,
    acceptedAt,
    connectionGeneration,
    profileCreatedAt,
  } = raw;
  const bounded = (value: unknown, max: number): value is string =>
    typeof value === 'string' && value.length > 0 && value.length <= max;
  const ordinal = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const digest = (value: unknown): value is string =>
    typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
  if (
    !bounded(captureKey, 2048) ||
    !bounded(spaceId, 256) ||
    !bounded(operationId, 256) ||
    !ordinal(acceptedAt) ||
    !ordinal(connectionGeneration) ||
    connectionGeneration === 0 ||
    !ordinal(profileCreatedAt) ||
    !digest(captureSha256) ||
    !digest(preparedSha256) ||
    !digest(attemptSha256) ||
    typeof attemptId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(attemptId) ||
    key !== verifiedOutgoingResultKey(spaceId, connectionGeneration, operationId) ||
    attemptKey !== JSON.stringify(['dispatch-attempt', spaceId, operationId, attemptId]) ||
    !bounded(remoteManifestKey, 2048) ||
    /[\\?#:]/u.test(remoteManifestKey) ||
    Array.from(remoteManifestKey).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127
    ) ||
    remoteManifestKey.split('/').some((part) => part === '' || part === '.' || part === '..')
  )
    return null;
  return {
    version: 1,
    kind: 'verified-outgoing-result',
    publicationKind: raw['publicationKind'],
    key,
    captureKey,
    acceptedAt,
    spaceId,
    connectionGeneration,
    profileCreatedAt,
    operationId,
    captureSha256,
    preparedSha256,
    attemptId,
    attemptKey,
    attemptSha256,
    remoteManifestKey,
  };
}

type EvidenceTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;
/** Read compact publication without joining payloads or physical attempts. */
export async function readPublishedOutgoingResult(
  tx: EvidenceTransaction,
  spaceId: string,
  operationId: string
): Promise<VerifiedOutgoingResult | null> {
  const operation = await readOutgoingOperation(tx, spaceId, operationId);
  return operation?.phase === 'published' ? publicationReceipt(operation) : null;
}
export async function loadVerifiedOutgoingResult(
  spaceId: string,
  connectionGeneration: number,
  operationId: string
): Promise<VerifiedOutgoingResult | null> {
  if (
    typeof spaceId !== 'string' ||
    spaceId.length === 0 ||
    spaceId.length > 256 ||
    typeof operationId !== 'string' ||
    operationId.length === 0 ||
    operationId.length > 256 ||
    !Number.isSafeInteger(connectionGeneration) ||
    connectionGeneration < 1
  )
    throw new Error('Invalid outgoing publication identity.');
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  const result = await readPublishedOutgoingResult(tx, spaceId, operationId);
  await tx.done;
  if (result && result.connectionGeneration !== connectionGeneration)
    throw new Error('Publication enrollment changed.');
  return result;
}

/** The native transaction owner compacts one exact accepted operation, including late publication. */
export async function publishOutgoingInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  expected: PreparedOutgoingOperation,
  attempt: OutgoingDispatchAttempt,
  kind: 'verified' | 'observed'
): Promise<{ result: VerifiedOutgoingResult; created: boolean }> {
  if (!matchesOutgoingDispatchPrepared(attempt, expected))
    throw new Error('Invalid outgoing publication binding.');
  const captures = tx.objectStore(SYNC_CAPTURE_STORE);
  const profile = parseSyncCaptureRecord(await captures.get('profile'));
  const current = parseSyncCaptureRecord(await captures.get(expected.captureKey));
  if (
    !profile ||
    profile.kind !== 'profile' ||
    profile.createdAt !== expected.profileCreatedAt ||
    profile.spaceId !== expected.spaceId ||
    profile.connectionGeneration !== expected.connectionGeneration ||
    !current ||
    current.kind !== 'sync-operation' ||
    current.sourceSha256 !== expected.captureSha256 ||
    current.profileCreatedAt !== expected.profileCreatedAt
  )
    throw new Error('Outgoing publication lifetime changed.');
  if (current.phase === 'published') {
    if (current.publication.preparedSha256 !== expected.recordSha256)
      throw new Error('Contradictory outgoing publication.');
    return { result: publicationReceipt(current), created: false };
  }
  if (
    current.phase !== 'prepared' ||
    JSON.stringify(projectPreparedOperation(current)) !== JSON.stringify(expected)
  )
    throw new Error('Outgoing publication source changed.');
  if (kind === 'verified') {
    const stored = parseOutgoingDispatchAttempt(
      await tx.objectStore(SYNC_OUTBOX_STORE).get(attempt.key)
    );
    if (!stored || JSON.stringify(stored) !== JSON.stringify(attempt))
      throw new Error('Outgoing publication attempt changed.');
  }
  const { prepared: _prepared, phase: _phase, ...header } = current;
  const operation: PublishedCaptureOperation = {
    ...header,
    phase: 'published',
    publication: {
      kind,
      acceptedAt: Date.now(),
      preparedSha256: expected.recordSha256,
      attemptId: attempt.attemptId,
      recordKey: attempt.recordKey,
      recordSha256: attempt.recordSha256,
    },
    objects: expected.objects.map((object) => {
      const binding = attempt.objects.find((item) => item.objectId === object.objectId);
      if (!binding) throw new Error('Missing publication object binding.');
      return { ...object, remoteKey: binding.remoteKey, pinned: true };
    }),
  };
  if (!parseSyncCaptureRecord(operation)) throw new Error('Invalid published operation.');
  await captures.put(operation);
  return { result: publicationReceipt(operation), created: true };
}

/** Call only after acknowledged manifest PUT and full size/SHA GET verification. */
export async function commitVerifiedOutgoingResult(
  expectedPrepared: unknown,
  expectedAttempt: unknown
): Promise<{ result: VerifiedOutgoingResult; created: boolean }> {
  const expected = parsePrepared(structuredClone(expectedPrepared));
  const attempt = parseOutgoingDispatchAttempt(structuredClone(expectedAttempt));
  if (!expected || !attempt) throw new Error('Invalid outgoing publication.');
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readwrite');
    try {
      const result = await publishOutgoingInTransaction(tx, expected, attempt, 'verified');
      await tx.done;
      return result;
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
