import { releaseCollectedPagePackages } from './download';
import { cleanupRecordedPagePackageLibraryAssets } from './library';
import type { ActivePopupExportJob } from './runtime-state';

function throwCancellationFailures(failures: unknown[]): void {
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Page Package cancellation cleanup failed.');
  }
}

export async function cancelPagePackageJobCaptureAuthorities(
  job: ActivePopupExportJob
): Promise<void> {
  const results = await Promise.allSettled(
    job.status.orderedTabs.map((tab) =>
      job.contentPort.cancelPagePackage({
        exportRunId: job.status.jobId,
        tabId: tab.tabId,
      })
    )
  );
  throwCancellationFailures(
    results.flatMap((result) => (result.status === 'rejected' ? [result.reason as unknown] : []))
  );
}

/** Serializes every retryable authority owned by cancellation, including durable staging. */
export function cleanupPopupExportJobCancellation(job: ActivePopupExportJob): Promise<void> {
  const cleanup = job.cancellationQueue.then(async () => {
    const retainedResults = await Promise.allSettled([
      cancelPagePackageJobCaptureAuthorities(job),
      cleanupRecordedPagePackageLibraryAssets(job.status.jobId),
      releaseCollectedPagePackages(job.status.jobId),
    ]);
    throwCancellationFailures(
      retainedResults.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : []
      )
    );
  });
  const observed = cleanup.then(
    () => {
      job.cancellationCleanupComplete = true;
      job.cancellationCleanupError = null;
    },
    (error: unknown) => {
      job.cancellationCleanupComplete = false;
      job.cancellationCleanupError = error;
      throw error;
    }
  );
  job.cancellationQueue = observed.catch(() => undefined);
  return observed;
}
