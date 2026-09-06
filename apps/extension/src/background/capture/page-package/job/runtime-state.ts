import {
  MAX_POPUP_EXPORT_JOB_TABS,
  MAX_POPUP_EXPORT_WARNINGS_TOTAL_BYTES,
  truncatePopupExportStatusText,
} from '@sniptale/runtime-contracts/export';
import { estimateUtf8Bytes } from '@sniptale/runtime-contracts/validation/base64';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { translate, type AppLocale, type TranslationKey } from '../../../../platform/i18n';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { writePagePackageJobStatus } from './storage';
import {
  clonePagePackageJobStatus,
  type PagePackageJobStatusPatch,
  type PagePackageJobStatusV1,
} from './status';

export type PopupExportJobContentPort = {
  cancelPagePackage: (args: { exportRunId: string; tabId: number }) => Promise<void>;
  requestPagePackage: (args: {
    batchRequestId: string;
    includeWebCopy: boolean;
    intent: 'export' | 'save';
    ordinal: number;
    options: import('@sniptale/runtime-contracts/export').ExportOptions;
    tabId: number;
  }) => Promise<unknown>;
};

export type ActivePopupExportJob = {
  abortController: AbortController;
  affectedWindowIds: Set<number>;
  cancelled: boolean;
  cancellationCleanupComplete: boolean;
  cancellationCleanupError: unknown | null;
  cancellationQueue: Promise<void>;
  contentPort: PopupExportJobContentPort;
  captureTiming?: import('@sniptale/runtime-contracts/page-package').PagePackageCaptureTimingPolicy;
  expectedActivation: { tabId: number; windowId: number } | null;
  lastActivatedByWindow: Map<number, number>;
  locale: AppLocale;
  manualActivationConflict: boolean;
  publicationQueue: Promise<void>;
  status: PagePackageJobStatusV1;
  completion: Promise<void> | null;
  finishCancellation: (() => void) | null;
  unsubscribeActivation: (() => void) | null;
  temporaryTabIds?: number[];
};

export function translatePopupExportJob(job: ActivePopupExportJob, key: TranslationKey): string {
  return translate(key, job.locale);
}

const durableStatuses = new WeakMap<ActivePopupExportJob, PagePackageJobStatusV1>();

export function readDurablePagePackageJobStatus(
  job: ActivePopupExportJob
): PagePackageJobStatusV1 | null {
  const status = durableStatuses.get(job);
  return status ? clonePagePackageJobStatus(status) : null;
}

async function commitStatusPublication(
  job: ActivePopupExportJob,
  status: PagePackageJobStatusV1
): Promise<void> {
  await writePagePackageJobStatus(status, job.locale);
  job.status = status;
  durableStatuses.set(job, status);
  await getBackgroundRuntimeMessaging()
    .sendRuntimeMessage({
      type: MessageType.PAGE_PACKAGE_JOB_STATUS_UPDATED,
      locale: job.locale,
      status: clonePagePackageJobStatus(status),
    })
    .catch(() => undefined);
}

function queueStatusOperation<T>(
  job: ActivePopupExportJob,
  operation: () => Promise<T>
): Promise<T> {
  const publication = job.publicationQueue.then(operation);
  job.publicationQueue = publication.then(
    () => undefined,
    () => undefined
  );
  return publication;
}

function queueStatusPublication(
  job: ActivePopupExportJob,
  propose: () => PagePackageJobStatusV1
): Promise<void> {
  return queueStatusOperation(job, async () => {
    await commitStatusPublication(job, clonePagePackageJobStatus(propose()));
  });
}

export async function publishPagePackageJobStatus(job: ActivePopupExportJob): Promise<void> {
  const initial = clonePagePackageJobStatus(job.status);
  return queueStatusPublication(job, () => initial);
}

export async function updatePagePackageJobStatus(
  job: ActivePopupExportJob,
  patch: PagePackageJobStatusPatch
): Promise<void> {
  const immutablePatch = structuredClone(patch);
  await queueStatusPublication(job, () => {
    const current = durableStatuses.get(job) ?? job.status;
    return {
      ...current,
      ...immutablePatch,
      ...(immutablePatch.progress
        ? { progress: { ...current.progress, ...immutablePatch.progress } }
        : {}),
      revision: current.revision + 1,
    };
  });
}

export function admitPopupExportJobCancellation(job: ActivePopupExportJob): Promise<boolean> {
  return queueStatusOperation(job, async () => {
    const current = durableStatuses.get(job) ?? job.status;
    if (current.phase !== 'running' && current.phase !== 'cancelling') return false;
    job.cancelled = true;
    job.abortController.abort();
    if (current.phase === 'running') {
      await commitStatusPublication(job, {
        ...current,
        phase: 'cancelling',
        progress: {
          ...current.progress,
          message: translatePopupExportJob(job, 'popup.export.cancellingMessage'),
        },
        revision: current.revision + 1,
      });
    }
    return true;
  });
}

export function completePagePackageJobStatus(
  job: ActivePopupExportJob,
  patch: PagePackageJobStatusPatch & { phase: 'completed' }
): Promise<boolean> {
  const immutablePatch = structuredClone(patch);
  return queueStatusOperation(job, async () => {
    const current = durableStatuses.get(job) ?? job.status;
    if (job.cancelled || current.phase !== 'running') return false;
    await commitStatusPublication(job, {
      ...current,
      ...immutablePatch,
      progress: { ...current.progress, ...immutablePatch.progress },
      revision: current.revision + 1,
    });
    return true;
  });
}

export function appendPopupExportJobWarning(
  job: ActivePopupExportJob,
  warning: string
): Promise<void> {
  if (job.status.warnings.includes(warning)) return Promise.resolve();
  const warnings = [...job.status.warnings, truncatePopupExportStatusText(warning)];
  if (warnings.length > MAX_POPUP_EXPORT_JOB_TABS) return Promise.resolve();
  let totalBytes = 0;
  for (const candidate of warnings) {
    totalBytes += estimateUtf8Bytes(candidate, MAX_POPUP_EXPORT_WARNINGS_TOTAL_BYTES);
    if (totalBytes > MAX_POPUP_EXPORT_WARNINGS_TOTAL_BYTES) return Promise.resolve();
  }
  return updatePagePackageJobStatus(job, { warnings });
}

export function popupExportJobErrorText(error: unknown): string {
  return truncatePopupExportStatusText(error instanceof Error ? error.message : String(error));
}
