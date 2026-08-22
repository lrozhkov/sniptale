import {
  deleteAssetObject,
  deleteReadyJournal,
  listReadyJournals,
  parseBackupAssetOperation,
  parseArchiveRestoreSession,
  parsePhysicalDeleteAssetOperation,
  completePhysicalDeleteOperation,
  collectQuiescentWritingObjects,
  recoverStandaloneAssetPublications,
  type AssetOperation,
  type AssetOperationCompensation,
  type ArchiveRestoreSession,
  clearArchiveRestoreCurrentRoot,
} from '../assets';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  RECORDING_TELEMETRY_STORE,
  STORE_NAME,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  runWithDurableAssetLifecycleLock,
  runWithDurableAssetOperationRecovery,
  type DurableAssetOperationPermit,
  type PersistenceMutationTransitionPermit,
} from '../infrastructure/mutation-barrier';
import {
  RECORDING_ASSET_OWNER_KIND,
  RECORDING_ASSET_ROLE,
  recordingAssetPublicationAdapter,
} from '../recordings/asset-publication';
import {
  projectAssetPublicationAdapter,
  projectExportPublicationAdapter,
} from '../projects/asset-publication';
import { scenarioAssetPublicationAdapter } from '../scenario/aggregate-mutations';
import { imageWorkspacePublicationAdapter } from '../image-aggregates/mutations';
import { webSnapshotPublicationAdapter } from '../web-snapshots/publication';
export { auditDurableAssets, collectOrphanAssetObjects } from './audit';
import { collectOrphanAssetObjects } from './audit';

async function restorePreviousRecord(
  store: { put(value: unknown): Promise<unknown> },
  value: unknown
): Promise<void> {
  if (value !== undefined) await store.put(value);
}

async function compensateRestoreOperation(operation: AssetOperation): Promise<void> {
  const compensated: AssetOperationCompensation[] = [];
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        ASSET_OPERATIONS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_REFS_STORE,
        MEDIA_LIBRARY_STORE,
        PROJECT_ASSETS_STORE,
        PROJECT_EXPORTS_STORE,
        RECORDING_TELEMETRY_STORE,
        STORE_NAME,
        THUMBNAILS_STORE,
        WEB_SNAPSHOTS_STORE,
      ],
      'readwrite'
    );
    const operationStore = tx.objectStore(ASSET_OPERATIONS_STORE);
    const current = parseBackupAssetOperation(await operationStore.get(operation.operationId));
    if (!current || current.status === 'committed') {
      await tx.done;
      return;
    }
    for (const compensation of [...current.compensations].reverse()) {
      if (compensation.nextWebSnapshotId) {
        await tx.objectStore(WEB_SNAPSHOTS_STORE).delete(compensation.nextWebSnapshotId);
      } else if (compensation.nextProjectAssetId) {
        await tx.objectStore(PROJECT_ASSETS_STORE).delete(compensation.nextProjectAssetId);
      } else if (compensation.nextProjectExportId) {
        await tx.objectStore(PROJECT_EXPORTS_STORE).delete(compensation.nextProjectExportId);
      } else {
        await tx.objectStore(STORE_NAME).delete(compensation.nextOwnerId);
      }
      await tx.objectStore(MEDIA_LIBRARY_STORE).delete(compensation.nextMediaId);
      await tx.objectStore(THUMBNAILS_STORE).delete(compensation.nextMediaId);
      if (
        !compensation.nextProjectAssetId &&
        !compensation.nextProjectExportId &&
        !compensation.nextWebSnapshotId
      ) {
        await tx.objectStore(RECORDING_TELEMETRY_STORE).delete(compensation.nextOwnerId);
      }
      await tx
        .objectStore(ASSET_OWNERS_STORE)
        .delete([
          compensation.ownerKind ?? RECORDING_ASSET_OWNER_KIND,
          compensation.nextOwnerId,
          compensation.ownerRole ?? RECORDING_ASSET_ROLE,
        ]);
      await tx.objectStore(ASSET_REFS_STORE).delete(compensation.assetId);
      const previous = compensation.previousRecords;
      await restorePreviousRecord(tx.objectStore(STORE_NAME), previous['recordingEntry']);
      await restorePreviousRecord(
        tx.objectStore(RECORDING_TELEMETRY_STORE),
        previous['recordingTelemetryEntry']
      );
      await restorePreviousRecord(
        tx.objectStore(PROJECT_EXPORTS_STORE),
        previous['projectExportEntry']
      );
      await restorePreviousRecord(
        tx.objectStore(PROJECT_ASSETS_STORE),
        previous['projectAssetEntry']
      );
      await restorePreviousRecord(
        tx.objectStore(WEB_SNAPSHOTS_STORE),
        previous['webSnapshotEntry']
      );
      await restorePreviousRecord(
        tx.objectStore(MEDIA_LIBRARY_STORE),
        previous['mediaLibraryEntry']
      );
      await restorePreviousRecord(tx.objectStore(THUMBNAILS_STORE), previous['thumbnailEntry']);
      await restorePreviousRecord(tx.objectStore(ASSET_REFS_STORE), previous['assetRefEntry']);
      await restorePreviousRecord(tx.objectStore(ASSET_OWNERS_STORE), previous['assetOwnerEntry']);
      for (const ref of Array.isArray(previous['assetRefEntries'])
        ? previous['assetRefEntries']
        : []) {
        await restorePreviousRecord(tx.objectStore(ASSET_REFS_STORE), ref);
      }
      for (const owner of Array.isArray(previous['assetOwnerEntries'])
        ? previous['assetOwnerEntries']
        : []) {
        await restorePreviousRecord(tx.objectStore(ASSET_OWNERS_STORE), owner);
      }
      compensated.push(compensation);
    }
    await operationStore.put({
      ...current,
      compensations: [],
      status: 'aborted',
      updatedAt: Date.now(),
    });
    await tx.done;
  });
  for (const compensation of compensated) {
    await deleteAssetObject(compensation.assetId);
    await deleteReadyJournal(compensation.journalId);
  }
}

async function deleteOperation(operationId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => db.delete(ASSET_OPERATIONS_STORE, operationId));
}

async function recoverBackupRestoreOperations(): Promise<void> {
  const operations = await runWithIndexedDbMutation(async (db) =>
    db.getAll(ASSET_OPERATIONS_STORE)
  );
  const byId = new Map<string, AssetOperation>();
  const archiveSessions = new Map<string, ArchiveRestoreSession>();
  const archiveSessionsWithAmbiguousJournals = new Set<string>();
  for (const raw of operations) {
    const physicalDelete = parsePhysicalDeleteAssetOperation(raw);
    if (physicalDelete) {
      await completePhysicalDeleteOperation(physicalDelete);
      continue;
    }
    const archiveSession = parseArchiveRestoreSession(raw);
    if (archiveSession) {
      archiveSessions.set(archiveSession.operationId, archiveSession);
      continue;
    }
    const parsedOperation = parseBackupAssetOperation(raw);
    if (!parsedOperation) continue;
    let operation = parsedOperation;
    if (operation.status === 'pending') {
      await runWithIndexedDbMutation(async (db) => {
        const tx = db.transaction(ASSET_OPERATIONS_STORE, 'readwrite');
        await tx.objectStore(ASSET_OPERATIONS_STORE).put({
          ...operation,
          status: 'aborted',
          updatedAt: Date.now(),
        });
        await tx.done;
      });
      operation = { ...operation, status: 'aborted' };
    }
    byId.set(operation.operationId, operation);
    if (operation.status === 'aborted' && operation.compensations.length > 0) {
      await compensateRestoreOperation(operation);
    }
  }
  for (const journal of await listReadyJournals()) {
    if (!journal.operationId) continue;
    const operation = byId.get(journal.operationId);
    if (operation?.status === 'committed') {
      await deleteReadyJournal(journal.journalId);
      continue;
    }
    const archiveSession = archiveSessions.get(journal.operationId);
    if (archiveSession) {
      const referenced = await runWithIndexedDbMutation(async (db) =>
        Promise.all(
          journal.assetRefs.map(async (ref) => Boolean(await db.get(ASSET_REFS_STORE, ref.assetId)))
        )
      );
      const rootKey =
        typeof journal.payload === 'object' &&
        journal.payload !== null &&
        'rootKey' in journal.payload &&
        typeof journal.payload.rootKey === 'string'
          ? journal.payload.rootKey
          : null;
      const committed = rootKey !== null && archiveSession.committedRoots.includes(rootKey);
      if (!committed && referenced.some(Boolean)) {
        archiveSessionsWithAmbiguousJournals.add(archiveSession.operationId);
        continue;
      }
      for (const [index, ref] of journal.assetRefs.entries()) {
        if (!referenced[index]) await deleteAssetObject(ref.assetId);
      }
      await deleteReadyJournal(journal.journalId);
      continue;
    }
    const referenced = await runWithIndexedDbMutation<unknown>(async (db) =>
      Promise.resolve(db.get(ASSET_REFS_STORE, journal.assetRefs[0]?.assetId ?? '') as unknown)
    );
    if (referenced === undefined) {
      for (const ref of journal.assetRefs) await deleteAssetObject(ref.assetId);
      await deleteReadyJournal(journal.journalId);
    }
  }
  for (const session of archiveSessions.values()) {
    if (
      session.status === 'pending' &&
      session.currentRoot !== null &&
      !archiveSessionsWithAmbiguousJournals.has(session.operationId)
    ) {
      await clearArchiveRestoreCurrentRoot(session.operationId);
    }
  }
  for (const operation of byId.values()) {
    if (operation.status === 'committed') {
      for (const assetId of operation.obsoleteAssetIds) await deleteAssetObject(assetId);
      await deleteOperation(operation.operationId);
      continue;
    }
    const remaining = await runWithIndexedDbMutation<unknown>(async (db) =>
      Promise.resolve(db.get(ASSET_OPERATIONS_STORE, operation.operationId) as unknown)
    );
    const parsedRemaining = parseBackupAssetOperation(remaining);
    if (parsedRemaining?.status === 'aborted' && parsedRemaining.compensations.length === 0) {
      await deleteOperation(operation.operationId);
    }
  }
}

export async function recoverAssetPublications(
  permit?: DurableAssetOperationPermit,
  transitionPermit?: PersistenceMutationTransitionPermit
): Promise<number> {
  return runWithDurableAssetOperationRecovery(permit, async () => {
    await collectQuiescentWritingObjects();
    await runWithDurableAssetLifecycleLock(recoverBackupRestoreOperations);
    const recovered = await recoverStandaloneAssetPublications(
      [
        recordingAssetPublicationAdapter,
        projectAssetPublicationAdapter,
        projectExportPublicationAdapter,
        scenarioAssetPublicationAdapter,
        imageWorkspacePublicationAdapter,
        webSnapshotPublicationAdapter,
      ],
      transitionPermit
    );
    await collectOrphanAssetObjects();
    return recovered;
  });
}
