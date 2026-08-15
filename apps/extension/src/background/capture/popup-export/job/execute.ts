import { translate } from '../../../../platform/i18n';
import { loadSettings } from '../../../../composition/persistence/settings';
import { executeDownloadBlob } from '../../download/download-router';
import { createPopupExportJobArchive, createPopupExportJobResult } from './archive';
import {
  capturePopupExportScreenshots,
  resolvePopupExportTabsAndOriginals,
  restorePopupExportOriginalTabs,
  subscribeToPopupExportManualActivation,
} from './visible';
import { collectPopupExportPagePackages } from './package-phase';
import {
  popupExportJobErrorText,
  updatePopupExportJobStatus,
  type ActivePopupExportJob,
} from './runtime-state';

async function runPopupExportJobStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(`${stage}: ${popupExportJobErrorText(error)}`, { cause: error });
  }
}

export async function executePopupExportJob(
  job: ActivePopupExportJob,
  onFinished: () => void
): Promise<void> {
  let errors: string[] = [];
  let packages: Awaited<ReturnType<typeof collectPopupExportPagePackages>>['packages'] = [];
  try {
    subscribeToPopupExportManualActivation(job);
    const tabs = await resolvePopupExportTabsAndOriginals(job);
    ({ errors, packages } = await collectPopupExportPagePackages(job, tabs));
    await capturePopupExportScreenshots({ job, packages, tabs });
    if (job.cancelled) throw new Error('Popup export cancelled');
    if (packages.length === 0) throw new Error(errors[0] || 'No page packages were collected');
    await updatePopupExportJobStatus(job, {
      progress: {
        current: packages.length,
        total: packages.length,
        errors,
        message: translate('popup.export.batchArchiveMessage'),
        phase: 'zipping',
      },
    });
    const archive = await runPopupExportJobStage('create popup export archive', () =>
      createPopupExportJobArchive({
        isCancelled: () => job.cancelled,
        options: job.status.effectiveOptions,
        packages,
      })
    );
    const settings = await runPopupExportJobStage('load popup export download settings', () =>
      loadSettings()
    );
    await runPopupExportJobStage('download popup export archive', () =>
      executeDownloadBlob(
        archive.blob,
        archive.filename,
        settings.defaultExportPresetId ?? undefined
      )
    );
    const result = createPopupExportJobResult({
      errors,
      filename: archive.filename,
      packages,
      warnings: job.status.warnings,
    });
    await updatePopupExportJobStatus(job, {
      phase: 'completed',
      result,
      progress: {
        current: packages.length,
        total: packages.length,
        errors,
        message: translate('popup.export.batchCompletedMessage'),
        phase: 'done',
      },
    });
  } catch (error) {
    const cancelled = job.cancelled;
    errors = cancelled ? errors : [...errors, popupExportJobErrorText(error)];
    await updatePopupExportJobStatus(job, {
      phase: cancelled ? 'cancelled' : 'failed',
      result: createPopupExportJobResult({
        errors,
        filename: '',
        packages,
        warnings: job.status.warnings,
      }),
      progress: {
        current: job.status.progress.current,
        total: job.status.progress.total,
        errors,
        message: cancelled
          ? translate('content.runtime.exportCancelled')
          : translate('popup.export.startExportError'),
        phase: 'error',
      },
    });
  } finally {
    const warningCountBeforeRestore = job.status.warnings.length;
    await restorePopupExportOriginalTabs(job);
    if (job.status.warnings.length !== warningCountBeforeRestore) {
      await updatePopupExportJobStatus(job, {
        ...(job.status.result
          ? { result: { ...job.status.result, warnings: [...job.status.warnings] } }
          : {}),
        warnings: [...job.status.warnings],
      });
    }
    job.unsubscribeActivation?.();
    onFinished();
  }
}
