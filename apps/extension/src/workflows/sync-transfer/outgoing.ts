import { releasePublishedOperationPins } from '../../composition/persistence/assets/operations';
import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import {
  SYNC_CAPTURE_STORE,
  SYNC_OUTBOX_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import type { SyncConnectionIdentity } from '../../composition/persistence/remote-connection/model';
import { readAssetFile } from '../../composition/persistence/assets';
import { parseSyncCaptureRecord } from '../../composition/persistence/sync-capture/guards';
import {
  commitPreparedOutgoingOperation,
  loadPreparedOutgoingOperation,
  readOutgoingOperation,
  preparedOutgoingOperationKey,
  type PreparedOutgoingOperation,
} from '../../composition/persistence/sync-capture/outgoing';
import {
  commitOutgoingDispatchAttempt,
  commitCompletedOutgoingFile,
  loadCompletedOutgoingFiles,
  type OutgoingDispatchAttempt,
} from '../../composition/persistence/sync-capture/outgoing-attempts';
import { commitVerifiedOutgoingResult } from '../../composition/persistence/sync-capture/outgoing-results';
import { digestBackupObject } from '../media-hub-backup/v6/shared-objects';
import { encodeCapturedPortableRoot } from './captured-root';
import type { scanSyncCatalog } from './catalog';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import {
  createSyncAttempt,
  hashSyncText,
  type parseSyncAttemptText,
  parseSyncOperationText,
} from './wire-record';

function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Invalid outgoing sync evidence.');
}
async function hashFile(blob: Blob, signal?: AbortSignal) {
  return digestBackupObject(
    {
      size: blob.size,
      pipeTo: (sink, abort) => blob.stream().pipeTo(sink, abort ? { signal: abort } : {}),
    },
    signal
  );
}

/** Freeze the existing portable codec output and immutable source bindings before network IO. */
export async function prepareCapturedOutgoing(value: unknown): Promise<PreparedOutgoingOperation> {
  const parsed = parseSyncCaptureRecord(structuredClone(value));
  check(parsed?.kind === 'sync-operation');
  const capture = parsed;
  const existing = await loadPreparedOutgoingOperation(capture.spaceId, capture.operationId);
  if (existing) {
    await parseSyncOperationText(existing.recordText);
    return commitPreparedOutgoingOperation(capture, existing);
  }
  check(capture.phase === 'native');
  const portable =
    capture.change.kind === 'tombstone' ? null : await encodeCapturedPortableRoot(capture);
  const objects = [];
  for (const object of portable?.objects ?? []) {
    const binding = portable?.bindings.find((item) => item.objectId === object.ref.objectId);
    check(binding);
    const sha256 = await hashFile(object.blob);
    check(binding.ref.sha256 === null || binding.ref.sha256 === sha256);
    objects.push({
      objectId: object.ref.objectId,
      ref: binding.ref,
      sha256,
      filename: object.ref.filename,
    });
  }
  const recordText = JSON.stringify({
    format: 'sniptale-sync-operation',
    version: 1,
    spaceId: capture.spaceId,
    operationId: capture.operationId,
    rootKind: capture.rootKind,
    rootId: capture.rootId,
    kind:
      capture.change.kind === 'tombstone'
        ? 'delete'
        : capture.origin === 'local-restore'
          ? 'restore'
          : 'edit',
    parents: capture.basis,
    dependencies: (portable?.dependencies ?? []).map((item) => ({
      mediaId: item.mediaId,
      basis: item.basis,
    })),
    envelope: portable?.envelope ?? null,
    objects: objects.map((item) => ({ objectId: item.objectId, sha256: item.sha256 })),
  });
  const accepted = await commitPreparedOutgoingOperation(capture, {
    version: 1,
    key: preparedOutgoingOperationKey(capture.spaceId, capture.operationId),
    createdAt: Date.now(),
    spaceId: capture.spaceId,
    connectionGeneration: capture.connectionGeneration,
    captureKey: capture.key,
    rootKey: capture.rootKey,
    generation: capture.generation,
    operationId: capture.operationId,
    recordText,
    recordSha256: hashSyncText(recordText),
    objects,
  });
  return accepted;
}

async function reserveAttempt(prepared: PreparedOutgoingOperation, retained: Map<string, string>) {
  const admit = async (physical: Awaited<ReturnType<typeof createSyncAttempt>>) =>
    commitOutgoingDispatchAttempt(prepared, {
      version: 1,
      spaceId: prepared.spaceId,
      operationId: prepared.operationId,
      connectionGeneration: prepared.connectionGeneration,
      profileCreatedAt: prepared.profileCreatedAt,
      captureSha256: prepared.captureSha256,
      preparedSha256: prepared.recordSha256,
      ...physical,
    });
  const fresh = await createSyncAttempt(prepared.recordText, crypto.randomUUID());
  const physical = await createSyncAttempt(
    prepared.recordText,
    fresh.attemptId,
    fresh.objects.map((item) => ({
      ...item,
      remoteKey: retained.get(item.objectId) ?? item.remoteKey,
    }))
  );
  const next = await admit(physical);
  check(next.created);
  return next.attempt;
}

class RemoteContentMismatch extends Error {}

async function verifyRemote(
  remote: SyncRemoteStore,
  key: string,
  size: number,
  sha256: string,
  signal: AbortSignal
) {
  const stream = await remote.read(key, signal);
  let bytes = 0;
  const checked = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (!Number.isSafeInteger(bytes) || bytes > size) throw new RemoteContentMismatch();
        controller.enqueue(chunk);
      },
      flush() {
        if (bytes !== size) throw new RemoteContentMismatch();
      },
    })
  );
  const actual = await digestBackupObject(
    { size, pipeTo: (sink) => checked.pipeTo(sink, { signal }) },
    signal
  );
  if (actual !== sha256) throw new RemoteContentMismatch();
}

async function readDispatchSources(
  prepared: PreparedOutgoingOperation,
  spaceId: string,
  operationId: string,
  signal: AbortSignal
) {
  const operation = await parseSyncOperationText(prepared.recordText);
  check(operation.spaceId === spaceId && operation.operationId === operationId);
  check(operation.objects.length === prepared.objects.length);
  const files = [];
  for (const object of prepared.objects) {
    const expected = operation.envelope?.objects.find((item) => item.objectId === object.objectId);
    check(
      expected &&
        operation.objects.some(
          (item) => item.objectId === object.objectId && item.sha256 === object.sha256
        )
    );
    check(expected.size === object.ref.size && expected.mimeType === object.ref.mimeType);
    const file = await readAssetFile(object.ref, expected.filename);
    check(file.size === expected.size && (await hashFile(file, signal)) === object.sha256);
    files.push({ objectId: object.objectId, file, sha256: object.sha256, expected });
  }
  return files;
}

type ParsedPhysicalAttempt = Awaited<ReturnType<typeof parseSyncAttemptText>>;

async function canReuseRemoteFile(
  remote: SyncRemoteStore,
  key: string,
  size: number,
  sha256: string,
  signal: AbortSignal,
  checkReusedContents: boolean
) {
  try {
    if (checkReusedContents) await verifyRemote(remote, key, size, sha256, signal);
    else {
      const observed = await remote.stat(key, signal);
      if (!Number.isSafeInteger(observed.size) || observed.size < 0)
        throw new SyncRemoteError('invalid-response');
      if (observed.size !== size) return false;
    }
    return true;
  } catch (error) {
    signal.throwIfAborted();
    if (
      !(error instanceof RemoteContentMismatch) &&
      !(error instanceof SyncRemoteError && error.code === 'missing')
    )
      throw error;
    return false;
  }
}

type OutgoingCatalog = Awaited<ReturnType<typeof scanSyncCatalog>>;
type CatalogCandidate = {
  operationId: string;
  operationText: string;
  recordKey: string;
  attemptId: string;
  objects: { objectId: string; remoteKey: string }[];
};

function snapshotCatalogCandidates(catalog: OutgoingCatalog | undefined, spaceId: string) {
  if (!catalog) return [];
  const excluded = new Set([
    ...catalog.pending,
    ...catalog.quarantined,
    ...catalog.invalidOperations,
  ]);
  const invalidKeys = new Set(catalog.invalid.map((item) => item.key));
  const candidates: CatalogCandidate[] = [];
  for (const [id, entry] of catalog.operations) {
    if (
      excluded.has(id) ||
      entry.operation.operationId !== id ||
      entry.operation.spaceId !== spaceId ||
      JSON.stringify(entry.operation) !== entry.operationText
    )
      continue;
    for (const attempt of entry.attempts) {
      if (
        invalidKeys.has(attempt.recordKey) ||
        attempt.operationText !== entry.operationText ||
        JSON.stringify(attempt.operation) !== entry.operationText
      )
        continue;
      candidates.push({
        operationId: id,
        operationText: entry.operationText,
        recordKey: attempt.recordKey,
        attemptId: attempt.attemptId,
        objects: attempt.objects.map(({ objectId, remoteKey }) => ({ objectId, remoteKey })),
      });
    }
  }
  return candidates;
}

async function readCatalogCandidates(candidates: CatalogCandidate[], spaceId: string) {
  const physical: ParsedPhysicalAttempt[] = [];
  for (const candidate of candidates) {
    // Only the wire owner can validate canonical physical mappings and exact logical bytes.
    try {
      const attempt = await createSyncAttempt(
        candidate.operationText,
        candidate.attemptId,
        candidate.objects
      );
      if (
        attempt.recordKey !== candidate.recordKey ||
        JSON.stringify(attempt.objects) !== JSON.stringify(candidate.objects)
      )
        continue;
      const operation = await parseSyncOperationText(candidate.operationText);
      if (operation.spaceId !== spaceId || operation.operationId !== candidate.operationId)
        continue;
      physical.push({ ...attempt, operation });
    } catch {
      // A malformed catalog alternative cannot supply file references.
      continue;
    }
  }
  return physical;
}

type RetainedFileCandidate = {
  object: Pick<
    NonNullable<ParsedPhysicalAttempt['operation']['envelope']>['objects'][number],
    'objectId' | 'filename' | 'size' | 'mimeType'
  >;
  digest: ParsedPhysicalAttempt['operation']['objects'][number];
  binding: ParsedPhysicalAttempt['objects'][number];
};

async function readRetainedCandidates(
  spaceId: string,
  connectionGeneration: number,
  catalog: CatalogCandidate[]
) {
  const candidates: RetainedFileCandidate[] = [];
  for (const candidate of await loadCompletedOutgoingFiles(spaceId, connectionGeneration))
    candidates.push({
      object: {
        objectId: candidate.objectId,
        filename: candidate.filename,
        size: candidate.ref.size,
        mimeType: candidate.ref.mimeType,
      },
      digest: { objectId: candidate.objectId, sha256: candidate.sha256 },
      binding: { objectId: candidate.objectId, remoteKey: candidate.remoteKey },
    });
  for (const physical of await readCatalogCandidates(catalog, spaceId)) {
    for (const object of physical.operation.envelope?.objects ?? []) {
      const digest = physical.operation.objects.find((item) => item.objectId === object.objectId);
      const binding = physical.objects.find((item) => item.objectId === object.objectId);
      check(digest && binding);
      candidates.push({ object, digest, binding });
    }
  }
  return candidates;
}

async function selectRetainedFiles(
  preparedText: string,
  spaceId: string,
  connectionGeneration: number,
  files: Awaited<ReturnType<typeof readDispatchSources>>,
  remote: SyncRemoteStore,
  signal: AbortSignal,
  catalog: CatalogCandidate[],
  checkReusedContents: boolean
) {
  const candidates = await readRetainedCandidates(spaceId, connectionGeneration, catalog);
  const defaultBindings = await createSyncAttempt(preparedText, crypto.randomUUID());
  const retained = new Map<string, string>();
  const checked = new Map<string, boolean>();
  for (const source of files) {
    for (const candidate of candidates) {
      signal.throwIfAborted();
      const { object, digest, binding } = candidate;
      if (
        digest.sha256 !== source.sha256 ||
        object.size !== source.expected.size ||
        object.mimeType !== source.expected.mimeType ||
        object.filename !== source.expected.filename
      )
        continue;
      try {
        await createSyncAttempt(
          preparedText,
          defaultBindings.attemptId,
          defaultBindings.objects.map((item) =>
            item.objectId === source.objectId ? { ...item, remoteKey: binding.remoteKey } : item
          )
        );
      } catch {
        continue;
      }
      const verificationKey = JSON.stringify([binding.remoteKey, object.size, digest.sha256]);
      let valid = checked.get(verificationKey);
      if (valid === undefined) {
        valid = await canReuseRemoteFile(
          remote,
          binding.remoteKey,
          object.size,
          digest.sha256,
          signal,
          checkReusedContents
        );
        checked.set(verificationKey, valid);
      }
      if (valid && ![...retained.values()].includes(binding.remoteKey)) {
        retained.set(source.objectId, binding.remoteKey);
        break;
      }
    }
  }
  return retained;
}

/** Publish independent references. Reuse does not attest current bytes or authorize release. */
export async function dispatchPreparedOutgoing(
  spaceId: string,
  operationId: string,
  remote: SyncRemoteStore,
  signal: AbortSignal,
  options: {
    catalog?: OutgoingCatalog;
    checkReusedContents?: boolean;
    admitAttempt?: (attempt: OutgoingDispatchAttempt) => Promise<void>;
  } = {}
) {
  signal.throwIfAborted();
  const catalog = snapshotCatalogCandidates(options.catalog, spaceId);
  const checkReusedContents = options.checkReusedContents === true;
  const admitAttempt = options.admitAttempt;
  const prepared = await loadPreparedOutgoingOperation(spaceId, operationId);
  check(prepared);
  const files = await readDispatchSources(prepared, spaceId, operationId, signal);
  signal.throwIfAborted();
  const retained = await selectRetainedFiles(
    prepared.recordText,
    spaceId,
    prepared.connectionGeneration,
    files,
    remote,
    signal,
    catalog,
    checkReusedContents
  );
  signal.throwIfAborted();
  const attempt = await reserveAttempt(prepared, retained);
  await admitAttempt?.(attempt);
  for (const binding of attempt.objects) {
    signal.throwIfAborted();
    const source = files.find((item) => item.objectId === binding.objectId);
    check(source);
    if (retained.get(binding.objectId) === binding.remoteKey) continue;
    await remote.write(binding.remoteKey, source.file, signal);
    await verifyRemote(remote, binding.remoteKey, source.file.size, source.sha256, signal);
    signal.throwIfAborted();
    await commitCompletedOutgoingFile(prepared, attempt, binding.objectId);
  }
  signal.throwIfAborted();
  const physical = await createSyncAttempt(prepared.recordText, attempt.attemptId, attempt.objects);
  check(physical.recordKey === attempt.recordKey && physical.recordSha256 === attempt.recordSha256);
  const manifest = new Blob([physical.recordText], { type: 'application/json' });
  await remote.write(attempt.recordKey, manifest, signal);
  await verifyRemote(remote, attempt.recordKey, manifest.size, attempt.recordSha256, signal);
  signal.throwIfAborted();
  await commitVerifiedOutgoingResult(prepared, attempt);
  return attempt;
}

/** Observe exact ready logical publication without minting acknowledged dispatch evidence. */
export async function findObservedOutgoingPublication(
  prepared: PreparedOutgoingOperation,
  catalog: OutgoingCatalog | undefined
): Promise<(OutgoingDispatchAttempt & { recordText: string }) | null> {
  const candidates = snapshotCatalogCandidates(catalog, prepared.spaceId).filter(
    (item) =>
      item.operationId === prepared.operationId && item.operationText === prepared.recordText
  );
  const alternatives = await readCatalogCandidates(candidates, prepared.spaceId);
  const physical = alternatives[0];
  if (!physical) return null;
  return {
    version: 1,
    kind: 'dispatch-attempt',
    key: JSON.stringify([
      'dispatch-attempt',
      prepared.spaceId,
      prepared.operationId,
      physical.attemptId,
    ]),
    createdAt: Date.now(),
    spaceId: prepared.spaceId,
    operationId: prepared.operationId,
    connectionGeneration: prepared.connectionGeneration,
    preparedSha256: prepared.recordSha256,
    profileCreatedAt: prepared.profileCreatedAt,
    captureSha256: prepared.captureSha256,
    attemptId: physical.attemptId,
    recordText: physical.recordText,
    recordSha256: physical.recordSha256,
    recordKey: physical.recordKey,
    objects: physical.objects,
  };
}

/** Verify current remote bytes before asking the native asset owner to retire compact pins. */
export async function releasePublishedOutgoing(
  spaceId: string,
  operationId: string,
  authorization: SyncConnectionIdentity,
  remote: SyncRemoteStore,
  signal: AbortSignal
) {
  signal.throwIfAborted();
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  const operation = await readOutgoingOperation(tx, spaceId, operationId);
  await tx.done;
  check(operation?.phase === 'published');
  return releasePublishedOperationPins(
    operation,
    authorization,
    async (object) => {
      signal.throwIfAborted();
      await verifyRemote(remote, object.remoteKey, object.ref.size, object.sha256, signal);
      signal.throwIfAborted();
    },
    signal
  );
}
