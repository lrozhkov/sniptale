import type { PopupExportJobStatus } from '@sniptale/runtime-contracts/export';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { writePopupExportJobStatus } from './storage';

export type PopupExportJobContentPort = {
  cancelPagePackage: (args: { exportRunId: string; tabId: number }) => Promise<void>;
  requestPagePackage: (args: {
    batchRequestId: string;
    options: import('@sniptale/runtime-contracts/export').ExportOptions;
    tabId: number;
  }) => Promise<unknown>;
};

export type ActivePopupExportJob = {
  abortController: AbortController;
  affectedWindowIds: Set<number>;
  cancelled: boolean;
  contentPort: PopupExportJobContentPort;
  expectedActivation: { tabId: number; windowId: number } | null;
  lastActivatedByWindow: Map<number, number>;
  manualActivationConflict: boolean;
  publicationQueue: Promise<void>;
  status: PopupExportJobStatus;
  completion: Promise<void> | null;
  unsubscribeActivation: (() => void) | null;
};

export function clonePopupExportJobStatus(status: PopupExportJobStatus): PopupExportJobStatus {
  return structuredClone(status);
}

export async function publishPopupExportJobStatus(job: ActivePopupExportJob): Promise<void> {
  const status = clonePopupExportJobStatus(job.status);
  const publication = job.publicationQueue.then(async () => {
    await writePopupExportJobStatus(status);
    await getBackgroundRuntimeMessaging()
      .sendRuntimeMessage({
        type: MessageType.POPUP_EXPORT_JOB_STATUS_UPDATED,
        status,
      })
      .catch(() => undefined);
  });
  job.publicationQueue = publication.catch(() => undefined);
  return publication;
}

export async function updatePopupExportJobStatus(
  job: ActivePopupExportJob,
  patch: Partial<Omit<PopupExportJobStatus, 'jobId' | 'revision'>>
): Promise<void> {
  job.status = { ...job.status, ...patch, revision: job.status.revision + 1 };
  await publishPopupExportJobStatus(job);
}

export function appendPopupExportJobWarning(
  job: ActivePopupExportJob,
  warning: string
): Promise<void> {
  if (job.status.warnings.includes(warning)) return Promise.resolve();
  return updatePopupExportJobStatus(job, { warnings: [...job.status.warnings, warning] });
}

export function popupExportJobErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
