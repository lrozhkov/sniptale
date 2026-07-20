import type JSZip from 'jszip';
import { runWithIndexedDbMutation } from '../../../composition/persistence/infrastructure/indexed-db/mutation';
import type { MediaHubImportConflictStrategy } from '../contracts/types';
import {
  assertBackupImportAssetEntriesAvailable,
  type BackupImportAssetPlan,
  loadBackupImportAssetBatch,
  type PreparedBackupImportAsset,
} from './prepare';
import { assertPreparedProjectBlobsAvailable } from './project/preflight';
import type { prepareProjectDomains } from './project/prepare';
import { isEmptyProjectDomainPlan, restorePreparedProjectDomainsInTransaction } from './projects';
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

type BackupTransaction = Parameters<typeof getStore>[0];
type PreparedProjectDomains = Awaited<ReturnType<typeof prepareProjectDomains>>;

const STANDALONE_RESTORE_BATCH_SIZE = 1;

async function restorePreparedAssetsInTransaction(
  tx: BackupTransaction,
  preparedAssets: PreparedBackupImportAsset[],
  strategy: MediaHubImportConflictStrategy,
  importedAssetCompensations: ImportedAssetCompensation[]
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
      prepared.webSnapshotRecord
    );
    imported += 1;
  }

  return imported;
}

interface ImportedAssetCompensation {
  nextEntry: BackupImportAssetPlan['nextEntry'];
  replacedSnapshot: BackupImportAssetRecordSnapshot | null;
}

async function cleanupImportedAssets(
  importedAssetCompensations: ImportedAssetCompensation[]
): Promise<void> {
  if (importedAssetCompensations.length === 0) {
    return;
  }

  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(getImportTransactionStoreNames(), 'readwrite');
    await commitBackupTransaction(tx, async () => {
      for (const compensation of importedAssetCompensations) {
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
  strategy: MediaHubImportConflictStrategy;
  zip: JSZip;
}): Promise<number> {
  let imported = 0;

  for (let index = 0; index < args.assetPlans.length; index += STANDALONE_RESTORE_BATCH_SIZE) {
    const batchPlans = args.assetPlans.slice(index, index + STANDALONE_RESTORE_BATCH_SIZE);
    const preparedAssets = await loadBackupImportAssetBatch({
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
          args.importedAssetCompensations
        )
      );
    });
    imported += restored;
  }

  return imported;
}

async function restorePreparedProjectDomains(args: {
  preparedProjectDomains: PreparedProjectDomains;
}): Promise<number> {
  if (isEmptyProjectDomainPlan(args.preparedProjectDomains)) {
    return 0;
  }

  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(getImportTransactionStoreNames(), 'readwrite');
    return commitBackupTransaction(tx, () =>
      restorePreparedProjectDomainsInTransaction(args.preparedProjectDomains, tx)
    );
  });
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

  const importedAssetCompensations: ImportedAssetCompensation[] = [];
  try {
    const importedAssets = await restorePreparedAssetsInBatches({
      assetPlans: args.assetPlans,
      importedAssetCompensations,
      strategy: args.strategy,
      zip: args.zip,
    });
    const importedProjects = await restorePreparedProjectDomains({
      preparedProjectDomains: args.preparedProjectDomains,
    });
    return importedAssets + importedProjects;
  } catch (error) {
    await cleanupImportedAssets(importedAssetCompensations);
    throw error;
  }
}
