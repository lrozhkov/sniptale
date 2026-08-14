import type {
  ExportOptions,
  PopupExportJobStatus,
  PopupExportJobTab,
} from '@sniptale/runtime-contracts/export';
import { translate } from '../../../../platform/i18n';
import { cancelPopupExportPagePackage } from '../../../runtime/routing/boundary/popup-export-routing';
import { executePopupExportJob } from './execute';
import {
  clonePopupExportJobStatus,
  publishPopupExportJobStatus,
  updatePopupExportJobStatus,
  type ActivePopupExportJob,
} from './runtime-state';
import { clearPopupExportJobStatus, readPopupExportJobStatus } from './storage';
import { acquirePopupExportMutationPermit } from './lifecycle-gate';

let activeJob: ActivePopupExportJob | null = null;

function createPopupExportJob(args: {
  jobId: string;
  options: ExportOptions;
  orderedTabs: PopupExportJobTab[];
  warnings: string[];
}): ActivePopupExportJob {
  return {
    abortController: new AbortController(),
    affectedWindowIds: new Set(),
    cancelled: false,
    completion: null,
    expectedActivation: null,
    lastActivatedByWindow: new Map(),
    manualActivationConflict: false,
    publicationQueue: Promise.resolve(),
    status: {
      jobId: args.jobId,
      revision: 1,
      phase: 'running',
      orderedTabs: args.orderedTabs.map((tab) => ({ ...tab })),
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

export async function startPopupExportJob(args: {
  jobId: string;
  options: ExportOptions;
  orderedTabs: PopupExportJobTab[];
  warnings: string[];
}): Promise<PopupExportJobStatus> {
  const releaseMutation = acquirePopupExportMutationPermit();
  if (!releaseMutation) throw new Error('Popup export is unavailable during privacy erasure');
  if (activeJob) {
    releaseMutation();
    throw new Error('Another popup export job is already active');
  }
  if (args.orderedTabs.length === 0) {
    releaseMutation();
    throw new Error('Popup export requires at least one tab');
  }

  const job = createPopupExportJob(args);
  activeJob = job;
  const initialPublication = publishPopupExportJobStatus(job);
  job.completion = initialPublication
    .then(() =>
      executePopupExportJob(job, () => {
        if (activeJob === job) activeJob = null;
      })
    )
    .finally(releaseMutation);
  void job.completion.catch(() => undefined);
  try {
    await initialPublication;
  } catch (error) {
    if (activeJob === job) activeJob = null;
    throw error;
  }
  return clonePopupExportJobStatus(job.status);
}

export async function getPopupExportJobStatus(
  jobId?: string
): Promise<PopupExportJobStatus | null> {
  const status = activeJob?.status ?? (await readPopupExportJobStatus());
  if (!status || (jobId !== undefined && status.jobId !== jobId)) return null;
  return clonePopupExportJobStatus(status);
}

export async function cancelPopupExportJob(jobId: string): Promise<PopupExportJobStatus> {
  if (!activeJob || activeJob.status.jobId !== jobId) {
    throw new Error('Popup export job is not active');
  }
  activeJob.cancelled = true;
  activeJob.abortController.abort();
  await updatePopupExportJobStatus(activeJob, { phase: 'cancelling' });
  await Promise.allSettled(
    activeJob.status.orderedTabs.map((tab) =>
      cancelPopupExportPagePackage({ exportRunId: jobId, tabId: tab.tabId })
    )
  );
  return clonePopupExportJobStatus(activeJob.status);
}

export async function erasePopupExportJobState(): Promise<void> {
  const job = activeJob;
  if (job) {
    job.cancelled = true;
    job.abortController.abort();
    await Promise.allSettled(
      job.status.orderedTabs.map((tab) =>
        cancelPopupExportPagePackage({ exportRunId: job.status.jobId, tabId: tab.tabId })
      )
    );
    await job.completion;
  }
  await clearPopupExportJobStatus();
}
