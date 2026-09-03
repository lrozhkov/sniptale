import type { ExportResult } from '@sniptale/runtime-contracts/export';
import {
  downloadCollectedPagePackages,
  releaseCollectedPagePackage,
  releaseCollectedPagePackages,
} from './download';
import {
  resolvePopupExportTabsAndOriginals,
  restorePopupExportOriginalTabs,
  subscribeToPopupExportManualActivation,
} from './visible';
import {
  collectPopupExportPagePackages,
  PopupExportPagePackageFatalError,
  PopupExportPagePackagePublicError,
  type CollectedStagedPagePackage,
} from './page-phase';
import { saveCollectedPagePackages } from './library';
import {
  appendPopupExportJobWarning,
  completePagePackageJobStatus,
  popupExportJobErrorText,
  translatePopupExportJob,
  updatePagePackageJobStatus,
  type ActivePopupExportJob,
} from './runtime-state';
import { cleanupPopupExportJobCancellation } from './cancellation';
import { startPagePackageActionIndicator } from './action-indicator';
import { preparePagePackageDownloadRuntime } from './offscreen-download-gateway';
import { cleanupTemporaryPagePackageTabs } from './source-tabs';
import type { TranslationKey } from '../../../../platform/i18n';

class PopupExportJobFailure extends Error {
  constructor(
    readonly detailKey: TranslationKey,
    options?: ErrorOptions
  ) {
    super(detailKey, options);
  }
}

function localizedExportFailure(job: ActivePopupExportJob, detailKey: TranslationKey): string {
  return `${translatePopupExportJob(job, 'content.runtime.exportFailed')}. ${translatePopupExportJob(
    job,
    detailKey
  )}`;
}

function aggregateProducerStats(
  current: ExportResult['stats'],
  next: ExportResult['stats']
): ExportResult['stats'] {
  const aggregate = {
    filesCount: current.filesCount + next.filesCount,
    filesFailed: current.filesFailed + next.filesFailed,
    rowsCount: current.rowsCount + next.rowsCount,
    sectionsCount: current.sectionsCount + next.sectionsCount,
  };
  if (!Object.values(aggregate).every(Number.isSafeInteger)) {
    throw new Error('Page Package producer statistics exceed their safe integer limit.');
  }
  return aggregate;
}

async function publishCompletedJob(
  job: ActivePopupExportJob,
  args: {
    errors: string[];
    filename: string;
    pageCount: number;
    snapshotIds?: string[];
    stats: ExportResult['stats'];
  }
): Promise<boolean> {
  return completePagePackageJobStatus(job, {
    phase: 'completed',
    result: {
      errors: args.errors,
      filename: args.filename,
      ...(args.snapshotIds
        ? {
            kind: 'webSnapshot' as const,
            snapshotBatchSize: job.status.orderedTabs.length,
            snapshotIds: args.snapshotIds,
          }
        : { kind: 'archive' as const }),
      stats: args.stats,
      success: args.snapshotIds ? args.snapshotIds.length > 0 : args.errors.length === 0,
      warnings: [...job.status.warnings],
    },
    progress: {
      activeStepKey: null,
      current: args.pageCount,
      total: job.status.orderedTabs.length,
      errors: args.errors,
      message: translatePopupExportJob(job, 'popup.export.batchCompletedMessage'),
      phase: 'done',
    },
  });
}

async function publishFailedJob(
  job: ActivePopupExportJob,
  args: {
    cancelled: boolean;
    cancellationCleanupIncomplete: boolean;
    errors: string[];
    pageCount: number;
    stats: ExportResult['stats'];
  }
): Promise<void> {
  const cancelledCleanly = args.cancelled && !args.cancellationCleanupIncomplete;
  await updatePagePackageJobStatus(job, {
    phase: args.cancellationCleanupIncomplete
      ? 'cancelling'
      : args.cancelled
        ? 'cancelled'
        : 'failed',
    ...(cancelledCleanly
      ? {}
      : {
          result: {
            errors: args.errors,
            filename: '',
            stats: args.stats,
            success: false,
            warnings: [...job.status.warnings],
          },
        }),
    progress: {
      activeStepKey: null,
      current: args.pageCount,
      total: job.status.orderedTabs.length,
      errors: cancelledCleanly ? [] : args.errors,
      message: args.cancellationCleanupIncomplete
        ? translatePopupExportJob(job, 'content.runtime.exportCancelFailed')
        : args.cancelled
          ? translatePopupExportJob(job, 'content.runtime.exportCancelled')
          : (args.errors.at(-1) ?? translatePopupExportJob(job, 'content.runtime.exportFailed')),
      phase: cancelledCleanly ? 'cancelled' : 'error',
    },
  });
}

async function releaseStagedBeforeSuccess(job: ActivePopupExportJob): Promise<void> {
  try {
    await releaseCollectedPagePackages(job.status.jobId);
  } catch (error) {
    throw new PopupExportJobFailure('popup.export.temporaryStorageErrorDetail', { cause: error });
  }
}

async function downloadValidatedPagePackages(
  args: Parameters<typeof downloadCollectedPagePackages>[0]
): Promise<Awaited<ReturnType<typeof downloadCollectedPagePackages>>> {
  try {
    return await downloadCollectedPagePackages(args);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Page Package download could not be completed safely')
    ) {
      throw new PopupExportJobFailure('popup.export.archiveDownloadErrorDetail', { cause: error });
    }
    throw new PopupExportJobFailure('popup.export.archiveValidationErrorDetail', { cause: error });
  }
}

async function saveValidatedPagePackage(
  job: ActivePopupExportJob,
  item: CollectedStagedPagePackage
): Promise<string> {
  try {
    const saved = await saveCollectedPagePackages({
      jobId: job.status.jobId,
      packages: [item],
      signal: job.abortController.signal,
    });
    const failure = saved.failures[0];
    if (failure) throw new Error(popupExportJobErrorText(failure.error));
    const snapshotId = saved.snapshotIds[0];
    if (!snapshotId) throw new Error('Page Package Library publication returned no snapshot ID.');
    return snapshotId;
  } catch (error) {
    throw new PopupExportPagePackagePublicError(
      localizedExportFailure(job, 'popup.export.librarySaveErrorDetail'),
      { cause: error }
    );
  }
}

async function finalizePopupExportJob(
  job: ActivePopupExportJob,
  stagedCleanupComplete: boolean,
  onFinished: () => void
): Promise<void> {
  await restorePopupExportOriginalTabs(job);
  try {
    await cleanupTemporaryPagePackageTabs(job.status.jobId, job.temporaryTabIds ?? []);
    job.temporaryTabIds = [];
  } catch {
    await appendPopupExportJobWarning(
      job,
      translatePopupExportJob(job, 'popup.export.temporaryTabsCleanupWarning')
    );
  }
  if (!stagedCleanupComplete && !job.cancelled) {
    await releaseCollectedPagePackages(job.status.jobId).catch(() => undefined);
  }
  job.unsubscribeActivation?.();
  if (job.cancellationCleanupError) job.finishCancellation = onFinished;
  else onFinished();
}

type PopupExportExecutionState = {
  errors: string[];
  pageCount: number;
  stagedCleanupComplete: boolean;
  stats: ExportResult['stats'];
};

function createPopupExportExecutionState(): PopupExportExecutionState {
  return {
    errors: [],
    pageCount: 0,
    stagedCleanupComplete: false,
    stats: { filesCount: 0, filesFailed: 0, rowsCount: 0, sectionsCount: 0 },
  };
}

async function collectPagePackages(
  job: ActivePopupExportJob,
  state: PopupExportExecutionState
): Promise<Awaited<ReturnType<typeof collectPopupExportPagePackages>>['packages']> {
  const tabs = await resolvePopupExportTabsAndOriginals(job);
  const collection = await collectPopupExportPagePackages(job, tabs);
  state.errors = collection.errors;
  state.stats = collection.packages.reduce<ExportResult['stats']>(
    (total, item) => aggregateProducerStats(total, item.descriptor.producerStats),
    state.stats
  );
  if (job.cancelled) throw new Error('Popup export cancelled');
  if (collection.packages.length === 0) {
    throw new PopupExportJobFailure('popup.export.pageCollectionErrorDetail');
  }
  await updatePagePackageJobStatus(job, {
    progress: {
      current: collection.packages.length,
      total: job.status.orderedTabs.length,
      errors: state.errors,
      message: translatePopupExportJob(job, 'popup.export.batchArchiveMessage'),
      phase: 'zipping',
    },
  });
  return collection.packages;
}

async function releaseProcessedSavePage(
  job: ActivePopupExportJob,
  item: CollectedStagedPagePackage
): Promise<void> {
  try {
    await releaseCollectedPagePackage(job.status.jobId, item);
  } catch (error) {
    try {
      await releaseCollectedPagePackages(job.status.jobId);
    } catch (retryError) {
      throw new PopupExportPagePackageFatalError('Page Package cleanup is incomplete.', {
        cause: new AggregateError([error, retryError], 'Page Package cleanup retry failed.'),
      });
    }
  }
}

async function completeSaveJob(
  job: ActivePopupExportJob,
  state: PopupExportExecutionState
): Promise<void> {
  const tabs = await resolvePopupExportTabsAndOriginals(job);
  const snapshotIds: string[] = [];
  const collection = await collectPopupExportPagePackages(job, tabs, async (item) => {
    state.stats = aggregateProducerStats(state.stats, item.descriptor.producerStats);
    let snapshotId: string;
    try {
      snapshotId = await saveValidatedPagePackage(job, item);
    } finally {
      await releaseProcessedSavePage(job, item);
    }
    snapshotIds.push(snapshotId);
    state.pageCount = snapshotIds.length;
  });
  state.errors = collection.errors;
  if (job.cancelled) throw new Error('Page Package save cancelled');
  if (state.pageCount === 0) {
    throw new PopupExportJobFailure('popup.export.pageCollectionErrorDetail');
  }
  await releaseStagedBeforeSuccess(job);
  state.stagedCleanupComplete = true;
  const completed = await publishCompletedJob(job, {
    errors: state.errors,
    filename: translatePopupExportJob(
      job,
      state.pageCount > 1 ? 'popup.export.webSnapshotsSaved' : 'popup.export.webSnapshotSaved'
    ),
    pageCount: state.pageCount,
    snapshotIds,
    stats: state.stats,
  });
  if (!completed) throw new Error('Page Package save cancelled');
}

function failedDownloadPages(job: ActivePopupExportJob) {
  return job.status.pageOutcomes.flatMap((outcome) =>
    outcome.status === 'failed'
      ? [
          {
            message:
              outcome.error ?? translatePopupExportJob(job, 'content.runtime.exportPrepareFailed'),
            ordinal: outcome.ordinal + 1,
            title: job.status.orderedTabs[outcome.ordinal]?.title ?? null,
          },
        ]
      : []
  );
}

async function completeExportJob(
  job: ActivePopupExportJob,
  state: PopupExportExecutionState,
  packages: Parameters<typeof downloadCollectedPagePackages>[0]['packages']
): Promise<void> {
  const result = await downloadValidatedPagePackages({
    errors: state.errors,
    failedPages: failedDownloadPages(job),
    jobId: job.status.jobId,
    packages,
    requestedPageCount: job.status.orderedTabs.length,
    signal: job.abortController.signal,
    warnings: job.status.warnings,
  });
  state.pageCount = result.pageCount;
  await releaseStagedBeforeSuccess(job);
  state.stagedCleanupComplete = true;
  const completed = await publishCompletedJob(job, {
    errors: state.errors,
    filename: result.filename,
    pageCount: state.pageCount,
    stats: state.stats,
  });
  if (!completed) throw new Error('Page Package export cancelled');
}

async function publishJobFailure(
  job: ActivePopupExportJob,
  state: PopupExportExecutionState,
  error: unknown
): Promise<void> {
  const cancelled = job.cancelled;
  if (cancelled) {
    try {
      await cleanupPopupExportJobCancellation(job);
      state.stagedCleanupComplete = true;
    } catch {
      // The cancellation owner retains the private failure; public status uses localized copy.
    }
  }
  const errorText = cancelled
    ? translatePopupExportJob(job, 'content.runtime.exportCancelFailed')
    : localizedExportFailure(
        job,
        error instanceof PopupExportJobFailure
          ? error.detailKey
          : error instanceof PopupExportPagePackageFatalError
            ? 'popup.export.temporaryStorageErrorDetail'
            : 'popup.export.exportProcessingErrorDetail'
      );
  if (!cancelled && !state.errors.includes(errorText)) state.errors = [...state.errors, errorText];
  if (cancelled && job.cancellationCleanupError) state.errors = [...state.errors, errorText];
  await publishFailedJob(job, {
    cancelled,
    cancellationCleanupIncomplete: job.cancellationCleanupError !== null,
    errors: state.errors,
    pageCount: state.pageCount,
    stats: state.stats,
  });
}

export async function executePopupExportJob(
  job: ActivePopupExportJob,
  onFinished: () => void
): Promise<void> {
  const state = createPopupExportExecutionState();
  const finishActionIndicator = startPagePackageActionIndicator(job);
  try {
    subscribeToPopupExportManualActivation(job);
    if (job.status.intent === 'save') {
      await completeSaveJob(job, state);
    } else {
      try {
        await preparePagePackageDownloadRuntime();
      } catch (error) {
        throw new PopupExportJobFailure('popup.export.downloadPreparationErrorDetail', {
          cause: error,
        });
      }
      const packages = await collectPagePackages(job, state);
      await completeExportJob(job, state, packages);
    }
  } catch (error) {
    await publishJobFailure(job, state, error);
  } finally {
    try {
      await finalizePopupExportJob(job, state.stagedCleanupComplete, onFinished);
    } finally {
      await finishActionIndicator();
    }
  }
}
