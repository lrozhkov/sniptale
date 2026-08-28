import { reconcileAndCleanupPagePackageOutput } from './download-effect';
import {
  interruptStoredPopupExportJob,
  readPagePackageJobRecoveryState,
  reconcileUnmatchedPagePackageJobJournals,
} from './storage';
import { reservePopupExportErasureExclusion } from './lifecycle-gate';
import { cleanupRecordedPagePackageLibraryAssets } from './library';

// policyStateIds: popup-export-jobs, popup-export-erasure-exclusion
let recoveryQueue = Promise.resolve();

/** Reconciles browser/offscreen effects and retries exact journal-backed cleanup after restart. */
export function recoverInterruptedPagePackageJob(
  options: { allowAbsentDownloadCleanup?: boolean; cancelActiveDownload?: boolean } = {}
): Promise<void> {
  const exclusion = reservePopupExportErasureExclusion();
  const operation = recoveryQueue
    .then(async () => {
      await exclusion.waitForActiveMutations();
      const failures: unknown[] = [];
      try {
        await reconcileUnmatchedPagePackageJobJournals();
      } catch (error) {
        failures.push(error);
      }
      const recovery = await readPagePackageJobRecoveryState();
      if (!recovery) {
        if (failures.length > 0) {
          throw new AggregateError(failures, 'Page Package restart reconciliation is incomplete.');
        }
        return;
      }
      try {
        await reconcileAndCleanupPagePackageOutput(recovery.jobId, options);
      } catch (error) {
        failures.push(error);
      }
      try {
        await cleanupRecordedPagePackageLibraryAssets(recovery.jobId);
      } catch (error) {
        failures.push(error);
      }
      try {
        await interruptStoredPopupExportJob(recovery.jobId);
      } catch (error) {
        failures.push(error);
      }
      if (failures.length > 0) {
        throw new AggregateError(failures, 'Page Package restart reconciliation is incomplete.');
      }
    })
    .finally(() => exclusion.release());
  recoveryQueue = operation.catch(() => undefined);
  return operation;
}
