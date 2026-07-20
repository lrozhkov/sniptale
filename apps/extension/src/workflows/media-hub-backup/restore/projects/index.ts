import type JSZip from 'jszip';
import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import { assertPreparedProjectBlobsAvailable } from '../project/preflight';
import type { PreparedProjectDomains } from '../project/prepare';
import { restorePreparedEffectBundlesInTransaction } from '../project/effect-bundle-writer';
import {
  restorePreparedScenarioProjectsInTransaction,
  restorePreparedVideoProjectsInTransaction,
} from '../project/writers';
import { commitBackupTransaction, getImportTransactionStoreNames } from '../write';
import type { getStore } from '../../storage';

type BackupTransaction = Parameters<typeof getStore>[0];

export async function restorePreparedProjectDomains(
  prepared: PreparedProjectDomains,
  zip: JSZip
): Promise<number> {
  if (isEmptyProjectDomainPlan(prepared)) {
    return 0;
  }

  await assertPreparedProjectBlobsAvailable(prepared, zip);
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(getImportTransactionStoreNames(), 'readwrite');
    return commitBackupTransaction(tx, () =>
      restorePreparedProjectDomainsInTransaction(prepared, tx)
    );
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
