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
  stagePreparedProjectAssets,
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
import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_EXPORT_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
} from '../../../composition/persistence/projects/asset-publication';

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
      ...(prepared.preparedAssetPublication
        ? { preparedAssetPublication: prepared.preparedAssetPublication }
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
      prepared.preparedAssetPublication
    );
    if (prepared.preparedAssetPublication) {
      if (!operationId) throw new Error('Restore operation ID is missing during publication.');
      const source = prepared.nextEntry.source;
      if (
        source.kind !== 'recording' &&
        source.kind !== 'project-export' &&
        source.kind !== 'project-asset'
      ) {
        throw new Error('Prepared durable asset has an invalid media source.');
      }
      const operation = parseBackupAssetOperation(
        await getBackupStore(tx, ASSET_OPERATIONS_STORE).get(operationId)
      );
      if (!operation || operation.status !== 'pending') {
        throw new Error('Restore operation is not pending during asset publication.');
      }
      const nextOwnerId =
        source.kind === 'recording'
          ? source.recordingId
          : source.kind === 'project-export'
            ? source.exportId
            : source.projectAssetId;
      const durableCompensation: AssetOperationCompensation = {
        assetId: prepared.preparedAssetPublication.asset.ref.assetId,
        journalId: prepared.preparedAssetPublication.journalId,
        nextMediaId: prepared.nextEntry.id,
        nextOwnerId,
        ...(source.kind === 'project-asset'
          ? {
              nextProjectAssetId: source.projectAssetId,
              ownerKind: PROJECT_ASSET_OWNER_KIND,
              ownerRole: PROJECT_MEDIA_ASSET_ROLE,
            }
          : {}),
        ...(source.kind === 'project-export' ? { nextProjectExportId: source.exportId } : {}),
        ...(source.kind === 'project-export'
          ? { ownerKind: PROJECT_EXPORT_OWNER_KIND, ownerRole: PROJECT_MEDIA_ASSET_ROLE }
          : {}),
        previousRecords: replacedSnapshot
          ? {
              assetOwnerEntry: replacedSnapshot.assetOwnerEntry,
              assetRefEntry: replacedSnapshot.assetRefEntry,
              mediaLibraryEntry: replacedSnapshot.mediaLibraryEntry,
              projectAssetEntry: replacedSnapshot.projectAssetEntry,
              projectExportEntry: replacedSnapshot.projectExportEntry,
              recordingEntry: replacedSnapshot.recordingEntry,
              recordingTelemetryEntry: replacedSnapshot.recordingTelemetryEntry,
              thumbnailEntry: replacedSnapshot.thumbnailEntry,
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
  preparedAssetPublication?: PreparedBackupImportAsset['preparedAssetPublication'];
  replacedSnapshot: BackupImportAssetRecordSnapshot | null;
}

async function cleanupImportedNonOperationAssets(
  importedAssetCompensations: ImportedAssetCompensation[]
): Promise<void> {
  const localCompensations = importedAssetCompensations.filter(
    (compensation) => !compensation.preparedAssetPublication
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

async function cleanupProjectMediaAssets(
  prepared: PreparedProjectDomains,
  deleteObjects: boolean
): Promise<void> {
  for (const project of prepared.videoProjects) {
    for (const assets of [project.restoredProjectAssets, project.restoredProjectExportAssets]) {
      for (const restored of assets?.values() ?? []) {
        if (deleteObjects) await deleteAssetObject(restored.asset.ref.assetId);
        await deleteReadyJournal(restored.journalId);
        releaseAssetReadyProtection([restored.asset.ref.assetId]);
      }
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
        plan.nextEntry.source.kind === 'project-export' ||
        plan.nextEntry.source.kind === 'project-asset'
    ) ||
    args.preparedProjectDomains.videoProjects.some(
      (project) =>
        project.descriptor.projectAssets.length > 0 || project.descriptor.projectExports.length > 0
    );
  if (needsAssetOperation) await recoverAssetPublications();
  const operation = needsAssetOperation ? await createBackupRestoreOperation() : null;
  const importedAssetCompensations: ImportedAssetCompensation[] = [];
  try {
    await stagePreparedProjectAssets(args.preparedProjectDomains, operation?.operationId);
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
      const prepared = compensation.preparedAssetPublication;
      if (!prepared) continue;
      await deleteReadyJournal(prepared.journalId).catch(() => undefined);
      releaseAssetReadyProtection([prepared.asset.ref.assetId]);
    }
    await cleanupProjectMediaAssets(args.preparedProjectDomains, false).catch(() => undefined);
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
      ...(operation ? [] : [cleanupProjectMediaAssets(args.preparedProjectDomains, true)]),
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
