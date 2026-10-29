import { parseSyncCaptureRecord } from '../sync-capture/guards';
import { parseSyncConnectionIdentity } from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import {
  SYNC_CAPTURE_STORE,
  SYNC_CONNECTION_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { runWithPersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { createMaintenanceLog } from '../library-lifecycle/maintenance-log';
import type { MaintenanceLogCode } from '../library-lifecycle/maintenance-log-model';
import { runStorageStartupPhase } from '../infrastructure/startup-diagnostics';
import { ASSET_OPERATIONS_STORE, initDB } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { deleteAssetObject, listReadyJournals, listWritingAssetIds } from './opfs-store';
import {
  runWithDurableAssetLifecycleLock,
  runWithPersistenceMutationTransition,
  type DurableAssetLifecyclePermit,
} from '../infrastructure/mutation-barrier';
import { parseArchiveRestoreSession, parseBackupAssetOperation } from './guards';
import type {
  AssetOperation,
  AssetOperationCompensation,
  AssetOperationStatus,
  PhysicalDeleteAssetOperation,
  ArchiveRestoreSession,
  ArchiveRestoreStrategy,
} from './contracts';
import { collectDurableAssetSnapshot } from './retention-authority';
import { readyJournalClaimsAsset } from './retention-claims';
export { collectBackupRollbackAssetIds, readyJournalClaimsAsset } from './retention-claims';
import { mergeArchiveRestoreChildIdMap } from './restore-child-ids';
import { releaseExpiredPrivateSources } from './private-source-retention';
import { tryAssetResourceCleanup } from './resource-sessions';

const maintenanceLog = createMaintenanceLog();

interface ArchiveRestoreSessionStore {
  get(operationId: string): Promise<unknown>;
  put(value: ArchiveRestoreSession): Promise<unknown>;
}

function createOperationId(): string {
  if (typeof crypto.randomUUID !== 'function')
    throw new Error('Secure operation IDs are unavailable.');
  return crypto.randomUUID();
}

export function buildPhysicalDeleteOperation(assetIds: string[]): PhysicalDeleteAssetOperation {
  const now = Date.now();
  return {
    operationId: createOperationId(),
    kind: 'physical-delete',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    assetIds: [...new Set(assetIds)],
  };
}

/** Complete a single intent through the same locked replay owner as recovery batches. */
export async function completePhysicalDeleteOperation(
  operation: PhysicalDeleteAssetOperation,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<void> {
  return completePhysicalDeleteOperations([operation], lifecyclePermit);
}

/** Reuse validation only while the lifecycle lock prevents ownership changes between intents. */
export async function completePhysicalDeleteOperations(
  operations: readonly PhysicalDeleteAssetOperation[],
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<void> {
  if (!operations.length) return;
  if (!(await tryAssetResourceCleanup(async () => true))) return;
  await initDB();
  await runWithDurableAssetLifecycleLock(async () => {
    let authority: Awaited<ReturnType<typeof readPhysicalDeleteAuthority>> | undefined;
    for (const operation of operations) {
      // Probe only: never hold the reader gate across nested retirement or metadata mutation.
      if (!(await tryAssetResourceCleanup(async () => true))) return;
      let admitted = operation;
      if (operation.privateSources?.length) {
        admitted =
          (await tryAssetResourceCleanup(async () => {
            const snapshot = await collectDurableAssetSnapshot();
            const journals = await listReadyJournals();
            return releaseExpiredPrivateSources(operation, snapshot, journals);
          })) ?? operation;
        // Logical mutation invalidates a previous projection; a busy reader needs no graph scan.
        authority = undefined;
      }
      if (!admitted.assetIds.length) {
        if (!admitted.privateSources?.length) await finishPhysicalDelete(admitted, [], false);
        continue;
      }
      authority ??= await readPhysicalDeleteAuthority();
      const currentAuthority = authority;
      const unowned = admitted.assetIds.filter((id) => currentAuthority(id) === 'unowned');
      const retained = admitted.assetIds.filter(
        (id) => !['unowned', 'adopted'].includes(currentAuthority(id))
      );
      const deferred = retained.length > 0 || Boolean(admitted.privateSources?.length);
      reportRetainedAssets(admitted.assetIds, currentAuthority);
      await finishPhysicalDelete(admitted, unowned, deferred);
    }
  }, lifecyclePermit);
}

/** Caller holds candidate object locks; validate, journal and delete under one lifecycle hold. */
export async function deleteOrphanAssetObjectBatch(
  candidates: readonly string[],
  signal: AbortSignal,
  lifecyclePermit: DurableAssetLifecyclePermit
): Promise<void> {
  if (!candidates.length || signal.aborted) return;
  await runWithDurableAssetLifecycleLock(async () => {
    const authority = await readPhysicalDeleteAuthority(signal);
    const writing = new Set(await listWritingAssetIds());
    reportRetainedAssets(candidates, authority);
    if (signal.aborted) return;
    const ids = candidates.filter((id) => authority(id) === 'unowned' && !writing.has(id));
    if (!ids.length) return;
    const operation = buildPhysicalDeleteOperation(ids);
    await runWithIndexedDbMutation(async (db) => {
      if (!signal.aborted) await db.put(ASSET_OPERATIONS_STORE, operation);
    });
    // Cancellation after commit cannot abandon intent; finish or retain it for replay on failure.
    if (signal.aborted) return;
    await finishPhysicalDelete(operation, ids, false);
  }, lifecyclePermit);
}

/** Read the current native retention authority before a caller removes physical bytes. */
export async function readPhysicalDeleteAuthority(signal?: AbortSignal) {
  const snapshot = await runWithIndexedDbMutation((db) =>
    runStorageStartupPhase('asset-retention-snapshot', () =>
      collectDurableAssetSnapshot(db, signal)
    )
  );
  const journals = await runStorageStartupPhase('asset-ready-journal-list', listReadyJournals);
  const refs = new Set(snapshot.refs.map((entry) => entry.assetId));
  const owners = new Set(snapshot.owners.map((entry) => entry.assetId));
  const projected = new Set(snapshot.expectedOwners.map((entry) => entry.assetId));
  return (
    id: string
  ): 'unowned' | 'adopted' | 'invalid' | 'mismatch' | 'referenced' | 'rollback' | 'publication' => {
    if (!snapshot.authorityValid) return 'invalid';
    if (refs.has(id) !== owners.has(id)) return 'mismatch';
    if (owners.has(id)) return 'adopted';
    if (projected.has(id)) return 'referenced';
    if (snapshot.protectedRollbackAssetIds.has(id)) return 'rollback';
    if (snapshot.protectedSyncCaptureAssetIds.has(id)) return 'publication';
    if (journals.some((journal) => readyJournalClaimsAsset(journal, id))) return 'publication';
    return 'unowned';
  };
}

function reportRetainedAssets(
  ids: readonly string[],
  authority: Awaited<ReturnType<typeof readPhysicalDeleteAuthority>>
): void {
  const reasons = new Map<MaintenanceLogCode, number>();
  for (const id of ids) {
    const reason = authority(id);
    if (reason !== 'unowned') reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }
  for (const [code, count] of reasons)
    void maintenanceLog.append({ operation: 'physical-delete', code, counts: { retained: count } });
}

async function finishPhysicalDelete(
  operation: PhysicalDeleteAssetOperation,
  ids: readonly string[],
  deferred: boolean
) {
  let deleted = 0;
  const started = performance.now();
  try {
    for (const id of ids) {
      await deleteAssetObject(id);
      deleted += 1;
    }
    if (!deferred)
      await runWithIndexedDbMutation((db) =>
        db.delete(ASSET_OPERATIONS_STORE, operation.operationId)
      );
    if (deleted)
      void maintenanceLog.append({
        operation: 'physical-delete',
        code: 'deleted',
        counts: { deleted },
        durationMs: Math.round(performance.now() - started),
      });
  } catch (error) {
    void maintenanceLog.append({
      operation: 'physical-delete',
      code: 'delete-failed',
      counts: { deleted, failed: ids.length - deleted },
      durationMs: Math.round(performance.now() - started),
    });
    throw error;
  }
}

export async function createBackupRestoreOperation(): Promise<AssetOperation> {
  const now = Date.now();
  const operation: AssetOperation = {
    operationId: createOperationId(),
    kind: 'backup-restore',
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    compensations: [],
    obsoleteAssetIds: [],
  };
  await runWithIndexedDbMutation(async (db) => db.add(ASSET_OPERATIONS_STORE, operation));
  return operation;
}

export async function readAssetOperation(operationId: string): Promise<AssetOperation | undefined> {
  const db = await initDB();
  const value: unknown = await db.get(ASSET_OPERATIONS_STORE, operationId);
  return parseBackupAssetOperation(value) ?? undefined;
}

async function mutateAssetOperation(
  operationId: string,
  expected: AssetOperationStatus,
  update: (operation: AssetOperation) => AssetOperation
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(ASSET_OPERATIONS_STORE, 'readwrite');
    const store = tx.objectStore(ASSET_OPERATIONS_STORE);
    const operation = parseBackupAssetOperation(await store.get(operationId));
    if (!operation || operation.status !== expected) {
      throw new Error(`Restore operation is not ${expected}.`);
    }
    await store.put(update(operation));
    await tx.done;
  });
}

export async function appendAssetOperationCompensation(
  operationId: string,
  compensation: AssetOperationCompensation
): Promise<void> {
  await mutateAssetOperation(operationId, 'pending', (operation) => ({
    ...operation,
    compensations: [...operation.compensations, compensation],
    updatedAt: Date.now(),
  }));
}

export async function transitionAssetOperation(
  operationId: string,
  expected: AssetOperationStatus,
  status: AssetOperationStatus
): Promise<void> {
  await mutateAssetOperation(operationId, expected, (operation) => ({
    ...operation,
    status,
    updatedAt: Date.now(),
  }));
}

export async function createArchiveRestoreSession(args: {
  archiveFingerprint: string;
  strategy: ArchiveRestoreStrategy;
}): Promise<ArchiveRestoreSession> {
  if (!/^[a-f0-9]{64}$/.test(args.archiveFingerprint)) {
    throw new Error('Archive restore fingerprint is invalid.');
  }
  const now = Date.now();
  const session: ArchiveRestoreSession = {
    archiveFingerprint: args.archiveFingerprint,
    childIdMap: {},
    committedRoots: [],
    conflictedRoots: [],
    createdAt: now,
    currentRoot: null,
    kind: 'archive-restore-session',
    operationId: createOperationId(),
    rootIdMap: {},
    skippedRoots: [],
    status: 'pending',
    strategy: args.strategy,
    updatedAt: now,
  };
  await runWithIndexedDbMutation(async (db) => db.add(ASSET_OPERATIONS_STORE, session));
  return session;
}

export async function listArchiveRestoreSessions(): Promise<ArchiveRestoreSession[]> {
  const db = await initDB();
  const values: unknown = await db.getAll(ASSET_OPERATIONS_STORE);
  if (!Array.isArray(values)) return [];
  return values
    .map(parseArchiveRestoreSession)
    .filter((value): value is ArchiveRestoreSession => value !== null);
}

export async function readArchiveRestoreSession(
  operationId: string
): Promise<ArchiveRestoreSession | undefined> {
  const db = await initDB();
  return parseArchiveRestoreSession(await db.get(ASSET_OPERATIONS_STORE, operationId)) ?? undefined;
}

async function mutateArchiveRestoreSession(
  operationId: string,
  mutate: (session: ArchiveRestoreSession) => ArchiveRestoreSession
): Promise<ArchiveRestoreSession> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(ASSET_OPERATIONS_STORE, 'readwrite');
    const store = tx.objectStore(ASSET_OPERATIONS_STORE);
    const session = parseArchiveRestoreSession(await store.get(operationId));
    if (!session) throw new Error('Archive restore session is unavailable.');
    const next = mutate(session);
    await store.put(next);
    await tx.done;
    return next;
  });
}

export async function beginArchiveRestoreRoot(
  operationId: string,
  rootKey: string
): Promise<ArchiveRestoreSession> {
  if (rootKey.length === 0) throw new Error('Archive restore root key is invalid.');
  return mutateArchiveRestoreSession(operationId, (session) => {
    if (session.status !== 'pending' || session.currentRoot !== null) {
      throw new Error('Archive restore session is not ready for another root.');
    }
    if (session.committedRoots.includes(rootKey)) {
      throw new Error('Archive restore root is already committed.');
    }
    return { ...session, currentRoot: rootKey, updatedAt: Date.now() };
  });
}

interface ArchiveRestoreRootCheckpoint {
  rootKey: string;
  targetRootId: string;
  imported?: boolean;
  conflicted?: boolean;
  childIds?: Readonly<Record<string, string>>;
}

export async function appendCommittedArchiveRootInTransaction(
  store: ArchiveRestoreSessionStore,
  operationId: string,
  checkpoint: ArchiveRestoreRootCheckpoint
): Promise<ArchiveRestoreSession> {
  const { rootKey, targetRootId } = checkpoint;
  if (targetRootId.length === 0) throw new Error('Archive restore target root ID is invalid.');
  const session = parseArchiveRestoreSession(await store.get(operationId));
  if (!session || session.status !== 'pending' || session.currentRoot !== rootKey) {
    throw new Error('Archive restore root checkpoint does not match the active session.');
  }
  if (session.committedRoots.includes(rootKey)) {
    throw new Error('Archive restore root is already committed.');
  }
  const childIdMap = mergeArchiveRestoreChildIdMap(session.childIdMap, checkpoint.childIds ?? {});
  const next: ArchiveRestoreSession = {
    ...session,
    childIdMap,
    committedRoots: [...session.committedRoots, rootKey],
    conflictedRoots: checkpoint.conflicted
      ? [...session.conflictedRoots, rootKey]
      : session.conflictedRoots,
    currentRoot: null,
    rootIdMap: { ...session.rootIdMap, [rootKey]: targetRootId },
    skippedRoots:
      checkpoint.imported === false ? [...session.skippedRoots, rootKey] : session.skippedRoots,
    updatedAt: Date.now(),
  };
  await store.put(next);
  return next;
}

export async function clearArchiveRestoreCurrentRoot(
  operationId: string
): Promise<ArchiveRestoreSession> {
  return mutateArchiveRestoreSession(operationId, (session) => {
    if (session.status !== 'pending') return session;
    return { ...session, currentRoot: null, updatedAt: Date.now() };
  });
}

export async function completeArchiveRestoreSession(
  operationId: string
): Promise<ArchiveRestoreSession> {
  return mutateArchiveRestoreSession(operationId, (session) => {
    if (session.status !== 'pending' || session.currentRoot !== null) {
      throw new Error('Archive restore session cannot be completed.');
    }
    return { ...session, status: 'completed', updatedAt: Date.now() };
  });
}

export async function abortArchiveRestoreSession(
  operationId: string
): Promise<ArchiveRestoreSession> {
  return mutateArchiveRestoreSession(operationId, (session) => {
    if (session.status !== 'pending') throw new Error('Archive restore session is not pending.');
    return { ...session, status: 'aborted', updatedAt: Date.now() };
  });
}

/**
 * Release only checked publication pins for ownerless native bytes.
 * Remote verification precedes the lifecycle hold. Existing delete authority rechecks every other claim.
 */
export async function releasePublishedOperationPins(
  expectedValue: unknown,
  authorizationValue: unknown,
  verifyRemote: (
    object: import('../sync-capture/contracts').PublishedCaptureOperation['objects'][number]
  ) => Promise<void>,
  signal?: AbortSignal
): Promise<{ released: string[]; intent: PhysicalDeleteAssetOperation | null }> {
  const expected = parseSyncCaptureRecord(structuredClone(expectedValue));
  const authorization = parseSyncConnectionIdentity(structuredClone(authorizationValue));
  if (
    !expected ||
    expected.kind !== 'sync-operation' ||
    expected.phase !== 'published' ||
    !authorization
  )
    throw new Error('Invalid publication pin release.');
  const db = await initDB();
  signal?.throwIfAborted();
  const selected = expected.objects.filter((object) => object.pinned);
  for (const object of selected) await verifyRemote(structuredClone(object));
  return runWithPersistenceMutationTransition(() =>
    runWithDurableAssetLifecycleLock(async (lifecyclePermit) => {
      signal?.throwIfAborted();
      const released = await tryAssetResourceCleanup(async () => {
        const snapshot = await collectDurableAssetSnapshot(db);
        const journals = await listReadyJournals();
        const writing = new Set(await listWritingAssetIds());
        if (!snapshot.authorityValid) throw new Error('Invalid asset retention authority.');
        const eligible = selected.filter(
          ({ ref }) =>
            !snapshot.refs.some((entry) => entry.assetId === ref.assetId) &&
            !snapshot.owners.some((entry) => entry.assetId === ref.assetId) &&
            !snapshot.expectedOwners.some((entry) => entry.assetId === ref.assetId) &&
            !snapshot.protectedRollbackAssetIds.has(ref.assetId) &&
            !writing.has(ref.assetId) &&
            !journals.some((journal) => readyJournalClaimsAsset(journal, ref.assetId))
        );
        if (!eligible.length) return { released: [], intent: null };
        const assetIds = [...new Set(eligible.map((object) => object.ref.assetId))];
        const intent = buildPhysicalDeleteOperation(assetIds);
        return runWithPersistenceMutationPermit(async () => {
          const tx = db.transaction(
            [SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE, ASSET_OPERATIONS_STORE],
            'readwrite'
          );
          try {
            const scope = {
              spaceId: expected.spaceId,
              connectionGeneration: expected.connectionGeneration,
              profileCreatedAt: expected.profileCreatedAt,
            };
            await checkSyncConnectionAdmission(tx, scope, authorization);
            const current = parseSyncCaptureRecord(
              await tx.objectStore(SYNC_CAPTURE_STORE).get(expected.key)
            );
            if (
              !current ||
              current.kind !== 'sync-operation' ||
              current.phase !== 'published' ||
              JSON.stringify(current) !== JSON.stringify(expected)
            )
              throw new Error('Publication pin binding changed.');
            // Other sync pins stay authoritative. Their later release can make this intent eligible.
            const objects = current.objects.map((object) =>
              eligible.some((item) => item.objectId === object.objectId)
                ? { ...object, pinned: false }
                : object
            );
            signal?.throwIfAborted();
            await tx.objectStore(SYNC_CAPTURE_STORE).put({ ...current, objects });
            await tx.objectStore(ASSET_OPERATIONS_STORE).add(intent);
            signal?.throwIfAborted();
            await tx.done;
            return { released: assetIds, intent };
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
      });
      if (!released) return { released: [], intent: null };
      if (released.intent) await completePhysicalDeleteOperation(released.intent, lifecyclePermit);
      return released;
    })
  );
}
