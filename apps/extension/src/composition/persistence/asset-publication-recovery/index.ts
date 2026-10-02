import { sameMediaSource } from '../media-library/dependencies';
import type { DurableAssetLifecyclePermit } from '../infrastructure/mutation-barrier';
import {
  cancelAssetPublication,
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
  buildPhysicalDeleteOperation,
} from '../assets';
import { parseAssetOwner, parseAssetRef } from '../assets';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { assertMediaSourceReplaceable } from '../projects/source-admission';
import { MediaAssetDeletionBlockedError } from '../media-library/deletion-errors';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { MediaDependencyTarget } from '../media-library/dependencies';
import {
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  VIDEO_WORKSPACES_STORE,
} from '../infrastructure/indexed-db/core';
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
  initDB,
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
import { scenarioHtmlPublicationAdapter } from '../scenario/export-artifacts';
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

type RecoveryTransaction = ReturnType<Awaited<ReturnType<typeof initDB>>['transaction']>;

async function readCompensationMediaTarget(
  tx: RecoveryTransaction,
  item: AssetOperationCompensation
): Promise<MediaDependencyTarget | null> {
  const role = item.ownerRole ?? 'body';
  const sourceId =
    item.nextWebSnapshotId ??
    item.nextProjectAssetId ??
    item.nextProjectExportId ??
    item.nextOwnerId;
  const store = item.nextWebSnapshotId
    ? WEB_SNAPSHOTS_STORE
    : item.nextProjectAssetId
      ? PROJECT_ASSETS_STORE
      : item.nextProjectExportId
        ? PROJECT_EXPORTS_STORE
        : STORE_NAME;
  const raw: unknown = await tx.objectStore(store).get(sourceId);
  const assetField = item.nextWebSnapshotId
    ? role === 'package'
      ? 'packageAssetId'
      : role === 'screenshot'
        ? 'screenshotAssetId'
        : null
    : 'assetId';
  if (!isRecord(raw) || raw['id'] !== sourceId || !assetField || raw[assetField] !== item.assetId)
    return null;
  const media: unknown = await tx.objectStore(MEDIA_LIBRARY_STORE).get(item.nextMediaId);
  const parsedMedia = parseMediaLibraryEntry(media);
  if (media !== undefined && (!parsedMedia || parsedMedia.id !== item.nextMediaId)) return null;
  if ((await tx.objectStore(VIDEO_WORKSPACES_STORE).get(item.nextMediaId)) !== undefined)
    return null;
  let source: MediaDependencyTarget['source'];
  if (item.nextWebSnapshotId) source = { kind: 'web-snapshot', snapshotId: sourceId };
  else if (item.nextProjectAssetId) source = { kind: 'project-asset', projectAssetId: sourceId };
  else if (item.nextProjectExportId) {
    if (typeof raw['projectId'] !== 'string') return null;
    source = { kind: 'project-export', exportId: sourceId, projectId: raw['projectId'] };
  } else source = { kind: 'recording', recordingId: sourceId };
  if (parsedMedia && !sameMediaSource(parsedMedia.source, source)) return null;
  return { id: item.nextMediaId, source };
}

function previousOwnershipReceiptIsValid(item: AssetOperationCompensation): boolean {
  const ownerKind = item.ownerKind ?? 'recording';
  const role = item.ownerRole ?? 'body';
  const previousOwner = item.previousRecords['assetOwnerEntry'];
  const previousRef = item.previousRecords['assetRefEntry'];
  if (previousOwner !== undefined) {
    const owner = parseAssetOwner(previousOwner);
    if (
      !owner ||
      owner.ownerKind !== ownerKind ||
      owner.ownerId !== item.nextOwnerId ||
      owner.role !== role
    )
      return false;
  }
  if (previousRef !== undefined && !parseAssetRef(previousRef)) return false;
  const previousOwners = item.previousRecords['assetOwnerEntries'];
  const previousRefs = item.previousRecords['assetRefEntries'];
  if (
    previousOwners !== undefined &&
    (!Array.isArray(previousOwners) ||
      previousOwners.some((raw) => {
        const owner = parseAssetOwner(raw);
        return !owner || owner.ownerKind !== ownerKind || owner.ownerId !== item.nextOwnerId;
      }))
  )
    return false;
  if (
    previousRefs !== undefined &&
    (!Array.isArray(previousRefs) || previousRefs.some((raw) => !parseAssetRef(raw)))
  )
    return false;
  return true;
}

function currentReceiptOwnerIsExclusive(
  owners: ReadonlyArray<ReturnType<typeof parseAssetOwner>>,
  item: AssetOperationCompensation,
  receiptKeys: ReadonlySet<string>
): boolean {
  const ownerKind = item.ownerKind ?? 'recording';
  const role = item.ownerRole ?? 'body';
  const own = owners.find(
    (owner) =>
      owner?.ownerKind === ownerKind && owner.ownerId === item.nextOwnerId && owner.role === role
  );
  return (
    !!own &&
    own.assetId === item.assetId &&
    !owners.some(
      (owner) =>
        owner?.assetId === item.assetId &&
        !receiptKeys.has(JSON.stringify([owner.ownerKind, owner.ownerId, owner.role]))
    )
  );
}

async function compensationIsStillExclusive(
  tx: RecoveryTransaction,
  operation: AssetOperation
): Promise<boolean> {
  const owners = (await tx.objectStore(ASSET_OWNERS_STORE).getAll()).map(parseAssetOwner);
  if (owners.some((owner) => !owner)) return false;
  const receiptKeys = new Set(
    operation.compensations.map((item) =>
      JSON.stringify([item.ownerKind ?? 'recording', item.nextOwnerId, item.ownerRole ?? 'body'])
    )
  );
  for (const item of operation.compensations) {
    if (
      !currentReceiptOwnerIsExclusive(owners, item, receiptKeys) ||
      !previousOwnershipReceiptIsValid(item)
    )
      return false;
    const currentRef = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(item.assetId));
    if (currentRef?.assetId !== item.assetId) return false;
    const target = await readCompensationMediaTarget(tx, item);
    if (!target) return false;
    try {
      await assertMediaSourceReplaceable(target, {
        assets: tx.objectStore(PROJECT_ASSETS_STORE),
        projects: tx.objectStore(VIDEO_PROJECTS_STORE),
        scenarioAssets: tx.objectStore(SCENARIO_ASSETS_STORE),
        videoWorkspaces: tx.objectStore(VIDEO_WORKSPACES_STORE),
      });
    } catch (error) {
      if (error instanceof MediaAssetDeletionBlockedError) return false;
      throw error;
    }
  }
  return true;
}

async function compensateRestoreOperation(
  operation: AssetOperation,
  lifecyclePermit: DurableAssetLifecyclePermit
): Promise<boolean> {
  const compensated: AssetOperationCompensation[] = [];
  const physicalDelete = buildPhysicalDeleteOperation([]);
  let admitted = false;
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
        VIDEO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
        VIDEO_WORKSPACES_STORE,
      ],
      'readwrite'
    );
    const operationStore = tx.objectStore(ASSET_OPERATIONS_STORE);
    const current = parseBackupAssetOperation(await operationStore.get(operation.operationId));
    if (!current || current.status === 'committed') {
      await tx.done;
      return;
    }
    if (!(await compensationIsStillExclusive(tx, current))) {
      await tx.done;
      return;
    }
    admitted = true;
    try {
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
        await restorePreviousRecord(
          tx.objectStore(ASSET_OWNERS_STORE),
          previous['assetOwnerEntry']
        );
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
      physicalDelete.assetIds = [...new Set(compensated.map((item) => item.assetId))];
      if (physicalDelete.assetIds.length) await operationStore.put(physicalDelete);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The transaction may already have aborted. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
  for (const compensation of compensated) {
    await deleteReadyJournal(compensation.journalId);
  }
  if (physicalDelete.assetIds.length)
    await completePhysicalDeleteOperation(physicalDelete, lifecyclePermit);
  return admitted;
}

async function deleteOperation(operationId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => db.delete(ASSET_OPERATIONS_STORE, operationId));
}

async function recoverBackupRestoreOperations(
  lifecyclePermit: DurableAssetLifecyclePermit
): Promise<void> {
  const operations = await runWithIndexedDbMutation(async (db) =>
    db.getAll(ASSET_OPERATIONS_STORE)
  );
  const byId = new Map<string, AssetOperation>();
  const blockedCompensations = new Set<string>();
  const archiveSessions = new Map<string, ArchiveRestoreSession>();
  const archiveSessionsWithAmbiguousJournals = new Set<string>();
  for (const raw of operations) {
    const physicalDelete = parsePhysicalDeleteAssetOperation(raw);
    if (physicalDelete) {
      await completePhysicalDeleteOperation(physicalDelete, lifecyclePermit);
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
      if (!(await compensateRestoreOperation(operation, lifecyclePermit)))
        blockedCompensations.add(operation.operationId);
    }
  }
  for (const journal of await listReadyJournals()) {
    if (!journal.operationId) continue;
    if (blockedCompensations.has(journal.operationId)) continue;
    const operation = byId.get(journal.operationId);
    if (operation?.status === 'committed') {
      await deleteReadyJournal(journal.journalId);
      continue;
    }
    const archiveSession = archiveSessions.get(journal.operationId);
    if (archiveSession) {
      const referenced = await runWithIndexedDbMutation(async (db) =>
        Promise.all(
          journal.assetRefs.map(
            async (ref) =>
              (await db.get(ASSET_REFS_STORE, ref.assetId)) !== undefined ||
              (await db.getAll(ASSET_OWNERS_STORE)).some(
                (raw) => !parseAssetOwner(raw) || parseAssetOwner(raw)?.assetId === ref.assetId
              )
          )
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
      await cancelAssetPublication(journal, lifecyclePermit);
      continue;
    }
    const referenced = await runWithIndexedDbMutation(async (db) => {
      const owners = (await db.getAll(ASSET_OWNERS_STORE)).map(parseAssetOwner);
      if (owners.some((owner) => !owner)) return true;
      for (const ref of journal.assetRefs) {
        if (
          (await db.get(ASSET_REFS_STORE, ref.assetId)) !== undefined ||
          owners.some((owner) => owner?.assetId === ref.assetId)
        )
          return true;
      }
      return false;
    });
    if (!referenced) {
      await cancelAssetPublication(journal, lifecyclePermit);
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
      const cleanup = buildPhysicalDeleteOperation(operation.obsoleteAssetIds);
      await runWithIndexedDbMutation(async (db) => {
        const tx = db.transaction(ASSET_OPERATIONS_STORE, 'readwrite');
        try {
          if (cleanup.assetIds.length) await tx.objectStore(ASSET_OPERATIONS_STORE).put(cleanup);
          await tx.objectStore(ASSET_OPERATIONS_STORE).delete(operation.operationId);
          await tx.done;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* The transaction may already have aborted. */
          }
          await tx.done.catch(() => undefined);
          throw error;
        }
      });
      if (cleanup.assetIds.length) await completePhysicalDeleteOperation(cleanup, lifecyclePermit);
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
  // Cold database admission reserves the exclusive transition gate; it must settle before
  // the durable operation and lifecycle locks are held or nested IndexedDB mutations would
  // queue it behind this context's own holds.
  await initDB();
  return runWithDurableAssetOperationRecovery(permit, async () => {
    await collectQuiescentWritingObjects();
    await runWithDurableAssetLifecycleLock((permit) => recoverBackupRestoreOperations(permit));
    const recovered = await recoverStandaloneAssetPublications(
      [
        recordingAssetPublicationAdapter,
        projectAssetPublicationAdapter,
        projectExportPublicationAdapter,
        scenarioAssetPublicationAdapter,
        scenarioHtmlPublicationAdapter,
        imageWorkspacePublicationAdapter,
        webSnapshotPublicationAdapter,
      ],
      transitionPermit
    );
    await collectOrphanAssetObjects();
    return recovered;
  });
}
