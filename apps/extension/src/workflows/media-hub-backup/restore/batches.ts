import type JSZip from 'jszip';
import { runWithIndexedDbMutation } from '../../../composition/persistence/infrastructure/indexed-db/mutation';
import type { MediaHubImportConflictStrategy } from '../contracts/types';
import {
  assertBackupImportAssetEntriesAvailable,
  type BackupImportAssetPlan,
  loadBackupImportAssetBatch,
  type PreparedBackupImportAsset,
} from './prepare';
import {
  assertPreparedProjectBlobsAvailable,
  stagePreparedProjectRecordingAssets,
} from './project/preflight';
import type { prepareProjectDomains } from './project/prepare';
import { commitPreparedProjectDomains, isEmptyProjectDomainPlan } from './projects';
import {
  assertBackupImportWritePreflightComplete,
  commitBackupTransaction,
  type BackupImportAssetRecordSnapshot,
  deleteExistingAssetRecord,
  getImportTransactionStoreNames,
  restoreAssetRecordSnapshot,
  restoreAssetRecord,
  snapshotExistingAssetRecord,
} from './write';
import type { getStore } from '../storage';
import { getStore as getBackupStore } from '../storage';
import { ASSET_OPERATIONS_STORE } from '../storage/constants';
import {
  createBackupRestoreOperation,
  transitionAssetOperation,
} from '../../../composition/persistence/assets/operations';
import {
  deleteAssetObject,
  deleteReadyJournal,
  parseBackupAssetOperation,
  parseAssetRef,
  releaseAssetReadyProtection,
  type AssetOperationCompensation,
} from '../../../composition/persistence/assets';
import { recoverAssetPublications } from '../../../composition/persistence/asset-publication-recovery';

type BackupTransaction = Parameters<typeof getStore>[0];
type PreparedProjectDomains = Awaited<ReturnType<typeof prepareProjectDomains>>;

const STANDALONE_RESTORE_BATCH_SIZE = 1;

async function restorePreparedAssetsInTransaction(
  tx: BackupTransaction,
  preparedAssets: PreparedBackupImportAsset[],
  strategy: MediaHubImportConflictStrategy,
  importedAssetCompensations: ImportedAssetCompensation[],
  operationId?: string
): Promise<number> {
  if (preparedAssets.length === 0) {
    return 0;
  }

  let imported = 0;
  assertBackupImportWritePreflightComplete(preparedAssets);

  for (const prepared of preparedAssets) {
    let replacedSnapshot: BackupImportAssetRecordSnapshot | null = null;
    if (prepared.existingEntry && strategy === 'replace') {
      replacedSnapshot = await snapshotExistingAssetRecord(tx, prepared.existingEntry);
    }
    importedAssetCompensations.push({
      nextEntry: prepared.nextEntry,
      ...(prepared.preparedRecordingAsset
        ? { preparedRecordingAsset: prepared.preparedRecordingAsset }
        : {}),
      replacedSnapshot,
    });
    if (prepared.existingEntry && strategy === 'replace') {
      await deleteExistingAssetRecord(tx, prepared.existingEntry);
    }

    await restoreAssetRecord(
      tx,
      prepared.nextEntry,
      prepared.assetBlob,
      prepared.thumbnailBlob,
      prepared.recordingTelemetry,
      prepared.webSnapshotRecord,
      prepared.workspace ?? null,
      prepared.presentation ?? null,
      prepared.preparedRecordingAsset
    );
    if (prepared.preparedRecordingAsset) {
      if (!operationId) throw new Error('Restore operation ID is missing during publication.');
      const source = prepared.nextEntry.source;
      if (source.kind !== 'recording' && source.kind !== 'project-export') {
        throw new Error('Prepared recording asset has an invalid media source.');
      }
      const operation = parseBackupAssetOperation(
        await getBackupStore(tx, ASSET_OPERATIONS_STORE).get(operationId)
      );
      if (!operation || operation.status !== 'pending') {
        throw new Error('Restore operation is not pending during recording publication.');
      }
      const durableCompensation: AssetOperationCompensation = {
        assetId: prepared.preparedRecordingAsset.asset.ref.assetId,
        journalId: prepared.preparedRecordingAsset.journalId,
        nextMediaId: prepared.nextEntry.id,
        nextOwnerId: source.recordingId,
        ...(source.kind === 'project-export' ? { nextProjectExportId: source.exportId } : {}),
        previousRecords: replacedSnapshot
          ? {
              assetOwnerEntry: replacedSnapshot.assetOwnerEntry,
              assetRefEntry: replacedSnapshot.assetRefEntry,
              mediaLibraryEntry: replacedSnapshot.mediaLibraryEntry,
              projectExportEntry: replacedSnapshot.projectExportEntry,
              recordingEntry: replacedSnapshot.recordingEntry,
              recordingTelemetryEntry: replacedSnapshot.recordingTelemetryEntry,
            }
          : {},
      };
      const obsoleteRef = parseAssetRef(replacedSnapshot?.assetRefEntry);
      await getBackupStore(tx, ASSET_OPERATIONS_STORE).put({
        ...operation,
        compensations: [...operation.compensations, durableCompensation],
        obsoleteAssetIds: obsoleteRef
          ? [...operation.obsoleteAssetIds, obsoleteRef.assetId]
          : operation.obsoleteAssetIds,
        updatedAt: Date.now(),
      });
    }
    imported += 1;
  }

  return imported;
}

interface ImportedAssetCompensation {
  nextEntry: BackupImportAssetPlan['nextEntry'];
  preparedRecordingAsset?: PreparedBackupImportAsset['preparedRecordingAsset'];
  replacedSnapshot: BackupImportAssetRecordSnapshot | null;
}

async function cleanupImportedNonOperationAssets(
  importedAssetCompensations: ImportedAssetCompensation[]
): Promise<void> {
  const localCompensations = importedAssetCompensations.filter(
    (compensation) => !compensation.preparedRecordingAsset
  );
  if (localCompensations.length === 0) {
    return;
  }

  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(getImportTransactionStoreNames(), 'readwrite');
    await commitBackupTransaction(tx, async () => {
      for (const compensation of localCompensations) {
        await deleteExistingAssetRecord(tx, compensation.nextEntry);
        if (compensation.replacedSnapshot) {
          await restoreAssetRecordSnapshot(tx, compensation.replacedSnapshot);
        }
      }
    });
  });
}

async function restorePreparedAssetsInBatches(args: {
  assetPlans: BackupImportAssetPlan[];
  importedAssetCompensations: ImportedAssetCompensation[];
  operationId?: string;
  strategy: MediaHubImportConflictStrategy;
  zip: JSZip;
}): Promise<number> {
  let imported = 0;

  for (let index = 0; index < args.assetPlans.length; index += STANDALONE_RESTORE_BATCH_SIZE) {
    const batchPlans = args.assetPlans.slice(index, index + STANDALONE_RESTORE_BATCH_SIZE);
    const preparedAssets = await loadBackupImportAssetBatch({
      ...(args.operationId ? { operationId: args.operationId } : {}),
      preparedAssets: batchPlans,
      zip: args.zip,
    });
    const restored = await runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(getImportTransactionStoreNames(), 'readwrite');
      return commitBackupTransaction(tx, () =>
        restorePreparedAssetsInTransaction(
          tx,
          preparedAssets,
          args.strategy,
          args.importedAssetCompensations,
          args.operationId
        )
      );
    });
    imported += restored;
  }

  return imported;
}

async function cleanupProjectRecordingAssets(
  prepared: PreparedProjectDomains,
  deleteObjects: boolean
): Promise<void> {
  for (const project of prepared.videoProjects) {
    for (const restored of project.restoredRecordingAssets?.values() ?? []) {
      if (deleteObjects) await deleteAssetObject(restored.asset.ref.assetId);
      await deleteReadyJournal(restored.journalId);
      releaseAssetReadyProtection([restored.asset.ref.assetId]);
    }
  }
}

export async function restorePreparedImportPlan(args: {
  assetPlans: BackupImportAssetPlan[];
  preparedProjectDomains: PreparedProjectDomains;
  strategy: MediaHubImportConflictStrategy;
  zip: JSZip;
}): Promise<number> {
  await assertPreparedProjectBlobsAvailable(args.preparedProjectDomains, args.zip);
  assertBackupImportAssetEntriesAvailable(args.assetPlans, args.zip);
  if (args.assetPlans.length === 0 && isEmptyProjectDomainPlan(args.preparedProjectDomains)) {
    return 0;
  }

  const needsAssetOperation =
    args.assetPlans.some(
      (plan) =>
        plan.nextEntry.source.kind === 'recording' ||
        plan.nextEntry.source.kind === 'project-export'
    ) ||
    args.preparedProjectDomains.videoProjects.some(
      (project) => project.descriptor.projectExports.length > 0
    );
  if (needsAssetOperation) await recoverAssetPublications();
  const operation = needsAssetOperation ? await createBackupRestoreOperation() : null;
  const importedAssetCompensations: ImportedAssetCompensation[] = [];
  try {
    await stagePreparedProjectRecordingAssets(args.preparedProjectDomains, operation?.operationId);
    const importedAssets = await restorePreparedAssetsInBatches({
      assetPlans: args.assetPlans,
      importedAssetCompensations,
      ...(operation ? { operationId: operation.operationId } : {}),
      strategy: args.strategy,
      zip: args.zip,
    });
    const importedProjects = await commitPreparedProjectDomains({
      ...(operation ? { operationId: operation.operationId } : {}),
      prepared: args.preparedProjectDomains,
    });
    if (operation && isEmptyProjectDomainPlan(args.preparedProjectDomains)) {
      await transitionAssetOperation(operation.operationId, 'pending', 'committed');
    }
    for (const compensation of importedAssetCompensations) {
      const prepared = compensation.preparedRecordingAsset;
      if (!prepared) continue;
      await deleteReadyJournal(prepared.journalId).catch(() => undefined);
      releaseAssetReadyProtection([prepared.asset.ref.assetId]);
    }
    await cleanupProjectRecordingAssets(args.preparedProjectDomains, false).catch(() => undefined);
    await recoverAssetPublications().catch(() => undefined);
    return importedAssets + importedProjects;
  } catch (error) {
    if (operation) {
      try {
        await transitionAssetOperation(operation.operationId, 'pending', 'aborted');
      } catch (abortError) {
        throw new AggregateError(
          [error, abortError],
          'Backup restore failed before its durable operation could be aborted.',
          { cause: abortError }
        );
      }
    }
    const cleanupResults = await Promise.allSettled([
      ...(operation ? [recoverAssetPublications()] : []),
      cleanupImportedNonOperationAssets(importedAssetCompensations),
      ...(operation ? [] : [cleanupProjectRecordingAssets(args.preparedProjectDomains, true)]),
    ]);
    const cleanupErrors = cleanupResults.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Backup restore failed and compensation was incomplete.',
        { cause: error }
      );
    }
    throw error;
  }
}
