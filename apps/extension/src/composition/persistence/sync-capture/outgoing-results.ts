import type { IDBPTransaction } from 'idb';
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
import {
  matchesOutgoingDispatchPrepared,
  parseOutgoingDispatchAttempt,
  type OutgoingDispatchAttempt,
} from './outgoing-attempts';

/** Historical acknowledged manifest publication. This grants no settlement or source-release authority. */
interface VerifiedOutgoingResult {
  version: 1;
  kind: 'verified-outgoing-result';
  key: string;
  acceptedAt: number;
  spaceId: string;
  connectionGeneration: number;
  operationId: string;
  captureSha256: string;
  preparedSha256: string;
  attemptId: string;
  attemptKey: string;
  attemptSha256: string;
  remoteManifestKey: string;
}

function bounded(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
function generation(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}
function digest(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
}

/** Disjoint tuple identity binds one immutable result to a logical namespace operation. */
export function verifiedOutgoingResultKey(
  spaceId: string,
  connectionGeneration: number,
  operationId: string
): string {
  return JSON.stringify(['verified-outgoing-result', spaceId, connectionGeneration, operationId]);
}

/** Parse stored receipt metadata. Native joins must also validate before consumption. */
export function parseVerifiedOutgoingResult(raw: unknown): VerifiedOutgoingResult | null {
  if (!isRecord(raw)) return null;
  const {
    spaceId,
    connectionGeneration,
    operationId,
    acceptedAt,
    attemptId,
    attemptKey,
    remoteManifestKey,
  } = raw;
  if (
    raw['version'] !== 1 ||
    raw['kind'] !== 'verified-outgoing-result' ||
    !bounded(spaceId) ||
    !bounded(operationId) ||
    !generation(connectionGeneration) ||
    raw['key'] !== verifiedOutgoingResultKey(spaceId, connectionGeneration, operationId) ||
    typeof acceptedAt !== 'number' ||
    !Number.isSafeInteger(acceptedAt) ||
    acceptedAt < 0 ||
    typeof attemptId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(attemptId) ||
    attemptKey !== JSON.stringify(['dispatch-attempt', spaceId, operationId, attemptId]) ||
    !digest(raw['captureSha256']) ||
    !digest(raw['preparedSha256']) ||
    !digest(raw['attemptSha256']) ||
    typeof remoteManifestKey !== 'string' ||
    remoteManifestKey.length === 0 ||
    remoteManifestKey.length > 2048 ||
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
    key: raw['key'],
    acceptedAt,
    spaceId,
    connectionGeneration,
    operationId,
    captureSha256: raw['captureSha256'],
    preparedSha256: raw['preparedSha256'],
    attemptId,
    attemptKey,
    attemptSha256: raw['attemptSha256'],
    remoteManifestKey,
  };
}

type EvidenceTransaction = IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>;

async function readEvidence(
  tx: EvidenceTransaction,
  spaceId: string,
  operationId: string,
  attemptKey: string
) {
  const store = tx.objectStore(SYNC_OUTBOX_STORE);
  const prepared = parsePrepared(
    await store.get(preparedOutgoingOperationKey(spaceId, operationId))
  );
  const attempt = parseOutgoingDispatchAttempt(await store.get(attemptKey));
  const capture = prepared
    ? parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get(prepared.captureKey))
    : null;
  if (
    !prepared ||
    !attempt ||
    !capture ||
    capture.kind !== 'captured-change' ||
    !matchesCapture(prepared, capture) ||
    !matchesOutgoingDispatchPrepared(attempt, prepared)
  )
    throw new Error('Invalid verified outgoing result evidence.');
  return { prepared, attempt };
}

/** Compare historical receipt metadata with its validated native preparation and physical attempt. */
export function matchesVerifiedOutgoingResult(
  result: VerifiedOutgoingResult,
  prepared: PreparedOutgoingOperation,
  attempt: OutgoingDispatchAttempt
): boolean {
  return (
    result.spaceId === prepared.spaceId &&
    result.operationId === prepared.operationId &&
    result.connectionGeneration === prepared.connectionGeneration &&
    result.captureSha256 === prepared.captureSha256 &&
    result.preparedSha256 === prepared.recordSha256 &&
    result.attemptId === attempt.attemptId &&
    result.attemptKey === attempt.key &&
    result.attemptSha256 === attempt.recordSha256 &&
    result.remoteManifestKey === attempt.recordKey
  );
}

/** Read retained publication evidence without writes or authorization for another dispatch. */
export async function loadVerifiedOutgoingResult(
  spaceId: string,
  connectionGeneration: number,
  operationId: string
): Promise<VerifiedOutgoingResult | null> {
  if (!bounded(spaceId) || !bounded(operationId) || !generation(connectionGeneration))
    throw new Error('Invalid verified outgoing result identity.');
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  const raw: unknown = await tx
    .objectStore(SYNC_OUTBOX_STORE)
    .get(verifiedOutgoingResultKey(spaceId, connectionGeneration, operationId));
  if (raw === undefined) {
    await tx.done;
    return null;
  }
  const result = parseVerifiedOutgoingResult(raw);
  if (
    !result ||
    result.spaceId !== spaceId ||
    result.connectionGeneration !== connectionGeneration ||
    result.operationId !== operationId
  )
    throw new Error('Invalid verified outgoing result.');
  const { prepared, attempt } = await readEvidence(tx, spaceId, operationId, result.attemptKey);
  if (!matchesVerifiedOutgoingResult(result, prepared, attempt))
    throw new Error('Invalid verified outgoing result join.');
  await tx.done;
  return result;
}

/**
 * Call only after acknowledged manifest PUT and full size/SHA GET verification.
 * First valid physical publication wins.
 */
export async function commitVerifiedOutgoingResult(
  expectedPrepared: unknown,
  expectedAttempt: unknown
): Promise<{ result: VerifiedOutgoingResult; created: boolean }> {
  const expected = parsePrepared(structuredClone(expectedPrepared));
  const attempt = parseOutgoingDispatchAttempt(structuredClone(expectedAttempt));
  if (!expected || !attempt || !matchesOutgoingDispatchPrepared(attempt, expected))
    throw new Error('Invalid verified outgoing result preparation.');
  const proposed: VerifiedOutgoingResult = {
    version: 1,
    kind: 'verified-outgoing-result',
    key: verifiedOutgoingResultKey(
      expected.spaceId,
      expected.connectionGeneration,
      expected.operationId
    ),
    acceptedAt: Date.now(),
    spaceId: expected.spaceId,
    connectionGeneration: expected.connectionGeneration,
    operationId: expected.operationId,
    captureSha256: expected.captureSha256,
    preparedSha256: expected.recordSha256,
    attemptId: attempt.attemptId,
    attemptKey: attempt.key,
    attemptSha256: attempt.recordSha256,
    remoteManifestKey: attempt.recordKey,
  };
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readwrite');
    try {
      const profile = parseSyncCaptureRecord(
        await tx.objectStore(SYNC_CAPTURE_STORE).get('profile')
      );
      const evidence = await readEvidence(tx, expected.spaceId, expected.operationId, attempt.key);
      if (
        !profile ||
        profile.kind !== 'profile' ||
        !profile.enabled ||
        profile.spaceId !== expected.spaceId ||
        profile.connectionGeneration !== expected.connectionGeneration ||
        JSON.stringify(evidence.prepared) !== JSON.stringify(expected) ||
        JSON.stringify(evidence.attempt) !== JSON.stringify(attempt)
      )
        throw new Error('Verified outgoing result evidence changed.');
      const store = tx.objectStore(SYNC_OUTBOX_STORE);
      const raw: unknown = await store.get(proposed.key);
      let result = proposed;
      if (raw !== undefined) {
        const accepted = parseVerifiedOutgoingResult(raw);
        if (!accepted) throw new Error('Contradictory verified outgoing result.');
        const first = await readEvidence(
          tx,
          accepted.spaceId,
          accepted.operationId,
          accepted.attemptKey
        );
        if (
          accepted.key !== proposed.key ||
          !matchesVerifiedOutgoingResult(accepted, first.prepared, first.attempt) ||
          JSON.stringify(first.prepared) !== JSON.stringify(expected)
        )
          throw new Error('Contradictory verified outgoing result.');
        result = accepted;
      } else await store.add(proposed);
      await tx.done;
      return { result, created: raw === undefined };
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
