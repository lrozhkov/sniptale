import type { PopupExportJobStatus } from '@sniptale/runtime-contracts/export';
import { browserStorage } from '../../../../composition/persistence/infrastructure/browser-storage';
import { isPopupExportJobStatus } from '../../../../contracts/messaging/validators/export';
import { translate } from '../../../../platform/i18n';
import { acquirePopupExportMutationPermit } from './lifecycle-gate';

const POPUP_EXPORT_JOB_STORAGE_KEY = 'sniptale_popup_export_job';

export async function readPopupExportJobStatus(): Promise<PopupExportJobStatus | null> {
  if (!browserStorage.session.isAvailable()) return null;
  const stored = await browserStorage.session.get([POPUP_EXPORT_JOB_STORAGE_KEY]);
  const value = stored[POPUP_EXPORT_JOB_STORAGE_KEY];
  return isPopupExportJobStatus(value) ? value : null;
}

export async function writePopupExportJobStatus(status: PopupExportJobStatus): Promise<void> {
  if (!browserStorage.session.isAvailable()) return;
  await browserStorage.session.set({ [POPUP_EXPORT_JOB_STORAGE_KEY]: status });
}

export async function interruptStoredPopupExportJob(): Promise<void> {
  const releaseMutation = acquirePopupExportMutationPermit();
  if (!releaseMutation) return;
  try {
    const status = await readPopupExportJobStatus();
    if (!status || (status.phase !== 'running' && status.phase !== 'cancelling')) return;
    await writePopupExportJobStatus({
      ...status,
      revision: status.revision + 1,
      phase: 'interrupted',
      progress: {
        ...status.progress,
        phase: 'error',
        message: translate('popup.export.jobInterruptedMessage'),
      },
    });
  } finally {
    releaseMutation();
  }
}

export async function clearPopupExportJobStatus(): Promise<void> {
  if (!browserStorage.session.isAvailable()) return;
  await browserStorage.session.remove(POPUP_EXPORT_JOB_STORAGE_KEY);
}
