import type { ExportOptions } from '@sniptale/runtime-contracts/export';
import type {
  PagePackageJobStatusV1,
  PagePackageJobTab,
} from '@sniptale/runtime-contracts/page-package';
import {
  MAX_POPUP_EXPORT_JOB_TABS,
  normalizePopupExportTabTitle,
} from '@sniptale/runtime-contracts/export';
import { translate } from '../../../../platform/i18n';
import { executePopupExportJob } from './execute';
import {
  publishPagePackageJobStatus,
  readDurablePagePackageJobStatus,
  updatePagePackageJobStatus,
  admitPopupExportJobCancellation,
  type ActivePopupExportJob,
  type PopupExportJobContentPort,
} from './runtime-state';
import {
  cancelPagePackageJobCaptureAuthorities,
  cleanupPopupExportJobCancellation,
} from './cancellation';
import {
  clearPagePackageJobStatus,
  hasUnresolvedPagePackageResources,
  readPagePackageJobStatus,
} from './storage';
import { acquirePopupExportMutationPermit } from './lifecycle-gate';
import { securityE2ECheckpoint } from '../../../../platform/security-e2e-control';
import {
  claimActivePagePackageJob,
  getActivePagePackageJob,
  releaseActivePagePackageJob,
} from './active-job';
import { createEffectiveComponentPlan, isPagePackageJobTerminalPhase } from './status';
import { clonePagePackageJobStatus } from './status';
import { recoverInterruptedPagePackageJob } from './recovery';

export { assertActivePopupExportStageBinding } from './active-job';

function createPopupExportJob(args: {
  contentPort: PopupExportJobContentPort;
  includeWebCopy: boolean;
  intent: 'export' | 'save';
  jobId: string;
  options: ExportOptions;
  orderedTabs: PagePackageJobTab[];
  warnings: string[];
}): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: false,
    cancellationCleanupComplete: false,
    cancellationCleanupError: null,
    cancellationQueue: Promise.resolve(),
    contentPort: args.contentPort,
    completion: null,
    finishCancellation: null,
    expectedActivation: null,
    lastActivatedByWindow: new Map(),
    manualActivationConflict: false,
    publicationQueue: Promise.resolve(),
    status: {
      effectiveComponentPlan: createEffectiveComponentPlan(
        args.intent,
        args.options,
        args.includeWebCopy
      ),
      intent: args.intent,
      jobId: args.jobId,
      revision: 1,
      phase: 'running',
      orderedTabs: args.orderedTabs.map((tab) => ({
        ...tab,
        title: normalizePopupExportTabTitle(tab.title),
      })),
      pageOutcomes: args.orderedTabs.map((tab, ordinal) => ({
        ordinal,
        status: 'pending',
        tabId: tab.tabId,
      })),
      effectiveOptions: { ...args.options },
      progress: {
        current: 0,
        total: args.orderedTabs.length,
        errors: [],
        message: translate('popup.export.preparingPreview'),
        phase: 'scanning',
      },
      warnings: [...args.warnings],
      originalActiveTabs: [],
      activatedTabIds: [],
    },
    unsubscribeActivation: null,
  };
}

function acquireStartPermit(orderedTabCount: number) {
  const releaseMutation = acquirePopupExportMutationPermit();
  if (!releaseMutation) throw new Error('Popup export is unavailable during privacy erasure');
  if (getActivePagePackageJob()) {
    releaseMutation();
    throw new Error('Another popup export job is already active');
  }
  if (orderedTabCount === 0) {
    releaseMutation();
    throw new Error('Popup export requires at least one tab');
  }
  if (orderedTabCount > MAX_POPUP_EXPORT_JOB_TABS) {
    releaseMutation();
    throw new Error('Popup export exceeds the supported tab count');
  }
  return releaseMutation;
}

function claimJobOrRelease(job: ActivePopupExportJob, releaseMutation: () => void): void {
  if (claimActivePagePackageJob(job)) return;
  releaseMutation();
  throw new Error('Another popup export job is already active');
}

async function verifyStartSecurityCheckpoint(
  job: ActivePopupExportJob,
  releaseMutation: () => void
): Promise<void> {
  try {
    if (typeof __SNIPTALE_SECURITY_E2E__ !== 'undefined' && __SNIPTALE_SECURITY_E2E__) {
      await securityE2ECheckpoint('popup-export-after-admission');
    }
  } catch (error) {
    releaseActivePagePackageJob(job);
    releaseMutation();
    throw error;
  }
}

async function beginJobExecution(
  job: ActivePopupExportJob,
  releaseMutation: () => void
): Promise<void> {
  const initialPublication = publishPagePackageJobStatus(job);
  job.completion = initialPublication
    .then(() => executePopupExportJob(job, () => releaseActivePagePackageJob(job)))
    .finally(releaseMutation);
  void job.completion.catch(() => undefined);
  try {
    await initialPublication;
  } catch (error) {
    releaseActivePagePackageJob(job);
    throw error;
  }
}

export async function startPagePackageJob(args: {
  contentPort: PopupExportJobContentPort;
  includeWebCopy: boolean;
  intent: 'export' | 'save';
  jobId: string;
  options: ExportOptions;
  orderedTabs: PagePackageJobTab[];
  warnings: string[];
}): Promise<PagePackageJobStatusV1> {
  if (new Set(args.orderedTabs.map((tab) => tab.tabId)).size !== args.orderedTabs.length) {
    throw new Error('Page Package tabs must be unique.');
  }
  if (args.intent === 'save') {
    if (!args.includeWebCopy) {
      throw new Error('Saved Page Packages require a Web copy.');
    }
    if (!args.options.includeFullPageScreenshot) {
      throw new Error('Saved Page Packages require a full-page screenshot.');
    }
  }
  const releaseMutation = acquireStartPermit(args.orderedTabs.length);
  const job = createPopupExportJob(args);
  claimJobOrRelease(job, releaseMutation);
  await verifyStartSecurityCheckpoint(job, releaseMutation);
  await beginJobExecution(job, releaseMutation);
  return clonePagePackageJobStatus(job.status);
}

export async function getPagePackageJobStatus(
  jobId?: string
): Promise<PagePackageJobStatusV1 | null> {
  const activeJob = getActivePagePackageJob();
  const status = activeJob
    ? readDurablePagePackageJobStatus(activeJob)
    : await readPagePackageJobStatus();
  if (!status || (jobId !== undefined && status.jobId !== jobId)) return null;
  return clonePagePackageJobStatus(status);
}

export async function cancelPagePackageJob(jobId: string): Promise<PagePackageJobStatusV1> {
  const activeJob = getActivePagePackageJob();
  if (!activeJob || activeJob.status.jobId !== jobId) {
    throw new Error('Popup export job is not active');
  }
  const job = activeJob;
  const retryingIncompleteCleanup = job.finishCancellation !== null;
  const cancellationAlreadyRunning = job.status.phase === 'cancelling';
  const admitted = await admitPopupExportJobCancellation(job);
  if (!admitted) return clonePagePackageJobStatus(job.status);
  if (!cancellationAlreadyRunning || retryingIncompleteCleanup) {
    void finishPagePackageJobCancellation(job, retryingIncompleteCleanup).catch(() => undefined);
  }
  return clonePagePackageJobStatus(job.status);
}

async function finishPagePackageJobCancellation(
  job: ActivePopupExportJob,
  retryingIncompleteCleanup: boolean
): Promise<void> {
  if (retryingIncompleteCleanup) {
    await cleanupPopupExportJobCancellation(job);
  } else {
    await cancelPagePackageJobCaptureAuthorities(job).catch(() => undefined);
    await job.completion;
  }
  if (job.cancellationCleanupError) throw job.cancellationCleanupError;
  if (!job.finishCancellation) return;
  await updatePagePackageJobStatus(job, {
    phase: 'cancelled',
    progress: {
      ...job.status.progress,
      activeStepKey: null,
      errors: [],
      message: translate('content.runtime.exportCancelled'),
      phase: 'cancelled',
    },
  });
  const finish = job.finishCancellation;
  job.finishCancellation = null;
  finish();
}

export async function acknowledgePagePackageJobStatus(
  jobId?: string
): Promise<PagePackageJobStatusV1 | null> {
  const activeJob = getActivePagePackageJob();
  if (activeJob) {
    const status = readDurablePagePackageJobStatus(activeJob);
    return status ? clonePagePackageJobStatus(status) : null;
  }
  const status = await readPagePackageJobStatus();
  if (!status) return null;
  if (jobId !== undefined && status.jobId !== jobId) {
    return clonePagePackageJobStatus(status);
  }
  if (!isPagePackageJobTerminalPhase(status.phase)) {
    return clonePagePackageJobStatus(status);
  }
  if (await hasUnresolvedPagePackageResources()) {
    try {
      await recoverInterruptedPagePackageJob({ allowAbsentDownloadCleanup: true });
    } catch {
      const retained = (await readPagePackageJobStatus()) ?? status;
      return clonePagePackageJobStatus(retained);
    }
    if (await hasUnresolvedPagePackageResources()) {
      const retained = (await readPagePackageJobStatus()) ?? status;
      return clonePagePackageJobStatus(retained);
    }
  }
  if (await clearPagePackageJobStatus(status.jobId)) return null;
  const replacement = await readPagePackageJobStatus();
  return replacement ? clonePagePackageJobStatus(replacement) : null;
}

export async function erasePopupExportJobState(): Promise<void> {
  const job = getActivePagePackageJob();
  const expectedJobId = job?.status.jobId ?? (await readPagePackageJobStatus())?.jobId ?? null;
  if (job) {
    await admitPopupExportJobCancellation(job);
    await cancelPagePackageJobCaptureAuthorities(job).catch(() => undefined);
    await job.completion;
    if (job.cancellationCleanupError) throw job.cancellationCleanupError;
    releaseActivePagePackageJob(job);
  }
  await recoverInterruptedPagePackageJob({
    allowAbsentDownloadCleanup: true,
    cancelActiveDownload: true,
  });
  if (expectedJobId !== null) await clearPagePackageJobStatus(expectedJobId);
}

/** Erasure calls this only after closing the job admission gate to new work. */
export async function requestActivePagePackageJobCancellationForPrivacyErasure(): Promise<void> {
  const job = getActivePagePackageJob();
  if (!job) return;
  await admitPopupExportJobCancellation(job);
}
