import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getCaptureJobRuntimeGeneration,
  hasCurrentRuntimeActiveCaptureJobForTab,
  hydrateCaptureJobsForReconciliation,
  removeCaptureJob,
  transitionCaptureJob,
  type CaptureJobRecord,
} from './state-machine';
import { runCaptureTabExclusive } from './tab-work-fence';

const ACTIVE_RESTART_FAILURE = 'Capture job interrupted by service worker restart';
const EXPORTING_RESTART_FAILURE = 'Capture download could not be reconciled after restart';
const ACTIVE_JOB_RESTART_TIMEOUT_MS = 5 * 60 * 1000;
const TERMINAL_JOB_RETENTION_MS = 24 * 60 * 60 * 1000;

const logger = createLogger({ namespace: 'BackgroundCaptureJobReconciliation' });

type ExportingDownloadReconciliationResult =
  | 'completed'
  | 'failed'
  | 'missing'
  | 'pending'
  | 'rebound';

type CaptureJobReconciliationOptions = {
  cleanupInterruptedCapture(tabId: number): Promise<void>;
  nowEpochMs?: number;
  reconcileExportingDownload(job: CaptureJobRecord): Promise<ExportingDownloadReconciliationResult>;
};

type CaptureJobReconciliationSummary = {
  activeFailed: number;
  downloadsReconciled: number;
  staleRemoved: number;
};

function isTerminalJob(job: CaptureJobRecord): boolean {
  return job.state === 'completed' || job.state === 'failed' || job.state === 'cancelled';
}

function isCurrentRuntimeJob(job: CaptureJobRecord): boolean {
  return job.runtimeGeneration === getCaptureJobRuntimeGeneration();
}

function isStale(job: CaptureJobRecord, nowEpochMs: number, timeoutMs: number): boolean {
  return nowEpochMs - job.updatedAtEpochMs > timeoutMs;
}

async function cleanupInterruptedCapture(
  job: CaptureJobRecord,
  cleanup: CaptureJobReconciliationOptions['cleanupInterruptedCapture']
): Promise<void> {
  await runCaptureTabExclusive(job.tabId, async () => {
    if (await hasCurrentRuntimeActiveCaptureJobForTab(job.tabId)) {
      logger.warn('Skipped interrupted capture cleanup because the tab has current capture work', {
        jobId: job.jobId,
        tabId: job.tabId,
      });
      return;
    }

    try {
      await cleanup(job.tabId);
    } catch (error) {
      logger.warn('Failed to clean up interrupted capture job on startup', {
        error,
        jobId: job.jobId,
        tabId: job.tabId,
      });
    }
  });
}

async function failInterruptedJob(
  job: CaptureJobRecord,
  options: CaptureJobReconciliationOptions
): Promise<void> {
  await cleanupInterruptedCapture(job, options.cleanupInterruptedCapture);
  await transitionCaptureJob(job.jobId, 'failed', { error: ACTIVE_RESTART_FAILURE });
}

async function reconcileExportingJob(
  job: CaptureJobRecord,
  options: CaptureJobReconciliationOptions,
  nowEpochMs: number
): Promise<'activeFailed' | 'downloadReconciled'> {
  if (
    typeof job.downloadId !== 'number' ||
    isStale(job, nowEpochMs, ACTIVE_JOB_RESTART_TIMEOUT_MS)
  ) {
    await transitionCaptureJob(job.jobId, 'failed', { error: EXPORTING_RESTART_FAILURE });
    return 'activeFailed';
  }

  const result = await options.reconcileExportingDownload(job);
  if (result === 'failed' || result === 'missing') {
    await transitionCaptureJob(job.jobId, 'failed', { error: EXPORTING_RESTART_FAILURE });
    return 'activeFailed';
  }

  return 'downloadReconciled';
}

async function reconcileCaptureJob(
  job: CaptureJobRecord,
  options: CaptureJobReconciliationOptions,
  nowEpochMs: number
): Promise<'activeFailed' | 'downloadReconciled' | 'staleRemoved' | 'unchanged'> {
  if (isTerminalJob(job)) {
    if (isStale(job, nowEpochMs, TERMINAL_JOB_RETENTION_MS)) {
      await removeCaptureJob(job.jobId);
      return 'staleRemoved';
    }
    return 'unchanged';
  }

  if (isCurrentRuntimeJob(job)) {
    return 'unchanged';
  }

  if (job.state === 'exporting') {
    return reconcileExportingJob(job, options, nowEpochMs);
  }

  await failInterruptedJob(job, options);
  return 'activeFailed';
}

function incrementSummary(
  summary: CaptureJobReconciliationSummary,
  result: Awaited<ReturnType<typeof reconcileCaptureJob>>
): void {
  if (result === 'activeFailed') {
    summary.activeFailed += 1;
  } else if (result === 'downloadReconciled') {
    summary.downloadsReconciled += 1;
  } else if (result === 'staleRemoved') {
    summary.staleRemoved += 1;
  }
}

export async function reconcileCaptureJobsOnStartup(
  options: CaptureJobReconciliationOptions
): Promise<CaptureJobReconciliationSummary> {
  const nowEpochMs = options.nowEpochMs ?? Date.now();
  const summary: CaptureJobReconciliationSummary = {
    activeFailed: 0,
    downloadsReconciled: 0,
    staleRemoved: 0,
  };
  const jobs = await hydrateCaptureJobsForReconciliation();

  for (const job of jobs) {
    try {
      incrementSummary(summary, await reconcileCaptureJob(job, options, nowEpochMs));
    } catch (error) {
      logger.warn('Failed to reconcile capture job on startup', { error, jobId: job.jobId });
    }
  }

  return summary;
}
