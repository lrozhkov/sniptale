import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import type { PreparedProjectDomains } from '../project/prepare';
import { restorePreparedEffectBundlesInTransaction } from '../project/effect-bundle-writer';
import {
  restorePreparedScenarioProjectsInTransaction,
  restorePreparedVideoProjectsInTransaction,
} from '../project/writers';
import { commitBackupTransaction, getImportTransactionStoreNames } from '../write';
import { getStore } from '../../storage';
import { ASSET_OPERATIONS_STORE } from '../../storage/constants';
import { parseBackupAssetOperation } from '../../../../composition/persistence/assets';

type BackupTransaction = Parameters<typeof getStore>[0];

export async function commitPreparedProjectDomains(args: {
  operationId?: string;
  prepared: PreparedProjectDomains;
}): Promise<number> {
  if (isEmptyProjectDomainPlan(args.prepared)) {
    return 0;
  }
  const hasProjectExportRecordings = args.prepared.videoProjects.some(
    (project) => project.descriptor.projectExports.length > 0
  );
  if (hasProjectExportRecordings && !args.operationId) {
    throw new Error('Project export restore requires a durable asset operation.');
  }

  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(getImportTransactionStoreNames(), 'readwrite');
    return commitBackupTransaction(tx, async () => {
      const imported = await restorePreparedProjectDomainsInTransaction(args.prepared, tx);
      if (args.operationId) {
        const operation = parseBackupAssetOperation(
          await getStore(tx, ASSET_OPERATIONS_STORE).get(args.operationId)
        );
        if (!operation || operation.status !== 'pending') {
          throw new Error('Restore operation is not pending at project commit.');
        }
        await getStore(tx, ASSET_OPERATIONS_STORE).put({
          ...operation,
          obsoleteAssetIds: [
            ...operation.obsoleteAssetIds,
            ...args.prepared.videoProjects.flatMap(
              (project) => project.obsoleteRecordingAssetIds ?? []
            ),
          ],
          status: 'committed',
          updatedAt: Date.now(),
        });
      }
      return imported;
    });
  });
}

export async function restorePreparedProjectDomainsInTransaction(
  prepared: PreparedProjectDomains,
  tx: BackupTransaction
): Promise<number> {
  const restoredBlobs = prepared.restoredBlobs;
  if (!restoredBlobs) throw new Error('Backup project blob preflight is incomplete.');
  const restoredVideoProjects = await restorePreparedVideoProjectsInTransaction(
    tx,
    prepared.videoProjects,
    restoredBlobs
  );
  const restoredEffectBundles = await restorePreparedEffectBundlesInTransaction(
    tx,
    prepared.effectBundles
  );
  const restoredScenarioProjects = await restorePreparedScenarioProjectsInTransaction(
    tx,
    prepared.scenarioProjects,
    restoredBlobs
  );
  return restoredVideoProjects + restoredScenarioProjects + restoredEffectBundles;
}

export function isEmptyProjectDomainPlan(prepared: PreparedProjectDomains): boolean {
  return (
    prepared.videoProjects.length === 0 &&
    prepared.scenarioProjects.length === 0 &&
    prepared.effectBundles.length === 0
  );
}
