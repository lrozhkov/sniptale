import { translate } from '../../../../../platform/i18n';
import type { PopupExportRuntimeContract } from '../state';
import type { PopupExportBatchPackage, PopupExportRuntimeDeps } from '../types';
import {
  logPopupExportBatchArchiveSaveFailure,
  logPopupExportBatchArchiveSaveStart,
  logPopupExportBatchArchiveSaveSuccess,
  logPopupExportBatchStale,
} from '../logging';
import { createBatchArchiveBlob, createBatchArchiveFilename } from './batch-archive';
import type { PopupBatchArchiveLayout } from './batch-layout';
import {
  applyBatchExportResult,
  isCurrentBatchRequest,
  setBatchExportProgress,
  setBatchSaveFailureProgress,
} from './batch-state';

async function saveBatchArchive(args: {
  archiveBlob: Blob;
  deps: PopupExportRuntimeDeps;
  filename: string;
  pageCount: number;
  requestId: string;
}) {
  logPopupExportBatchArchiveSaveStart({
    pageCount: args.pageCount,
    requestId: args.requestId,
  });

  try {
    await args.deps.saveArchiveBlob(args.archiveBlob, args.filename);
  } catch (error) {
    logPopupExportBatchArchiveSaveFailure({
      pageCount: args.pageCount,
      requestId: args.requestId,
      ...(error instanceof Error ? { error: error.message } : {}),
    });
    throw error;
  }
}

function isBatchFinishStale(state: PopupExportRuntimeContract, requestId: string): boolean {
  if (!isCurrentBatchRequest(state, requestId)) {
    logPopupExportBatchStale({
      phase: 'finish',
      requestId,
    });
    return true;
  }

  return false;
}

function setBatchArchiveProgress(state: PopupExportRuntimeContract, pageCount: number) {
  setBatchExportProgress(
    state,
    pageCount,
    pageCount,
    translate('popup.export.batchArchiveMessage'),
    'zipping'
  );
}

async function createCurrentBatchArchive(args: {
  layout: PopupBatchArchiveLayout;
  pagePackages: PopupExportBatchPackage[];
  requestId: string;
  state: PopupExportRuntimeContract;
}): Promise<Blob | null> {
  try {
    return await createBatchArchiveBlob(args.pagePackages, args.layout, {
      isCancelled: () => !isCurrentBatchRequest(args.state, args.requestId),
    });
  } catch (error) {
    if (isBatchFinishStale(args.state, args.requestId)) {
      return null;
    }
    throw error;
  }
}

function applyBatchArchiveSuccess(args: {
  errors: string[];
  filename: string;
  pagePackages: PopupExportBatchPackage[];
  requestId: string;
  state: PopupExportRuntimeContract;
}) {
  logPopupExportBatchArchiveSaveSuccess({
    pageCount: args.pagePackages.length,
    requestId: args.requestId,
  });
  applyBatchExportResult({
    errors: args.errors,
    filename: args.filename,
    pagePackages: args.pagePackages,
    state: args.state,
  });
}

async function saveBatchArchiveOrReportFailure(args: {
  archiveBlob: Blob;
  deps: PopupExportRuntimeDeps;
  errors: string[];
  filename: string;
  pagePackages: PopupExportBatchPackage[];
  requestId: string;
  state: PopupExportRuntimeContract;
}): Promise<boolean> {
  setBatchArchiveProgress(args.state, args.pagePackages.length);

  try {
    await saveBatchArchive({
      archiveBlob: args.archiveBlob,
      deps: args.deps,
      filename: args.filename,
      pageCount: args.pagePackages.length,
      requestId: args.requestId,
    });
    return true;
  } catch (error) {
    setBatchSaveFailureProgress({
      error,
      errors: args.errors,
      pagePackages: args.pagePackages,
      state: args.state,
    });
    return false;
  }
}

export async function finishBatchExport(args: {
  deps: PopupExportRuntimeDeps;
  errors: string[];
  layout: PopupBatchArchiveLayout;
  pagePackages: PopupExportBatchPackage[];
  requestId: string;
  state: PopupExportRuntimeContract;
}) {
  const filename = createBatchArchiveFilename();
  if (isBatchFinishStale(args.state, args.requestId)) {
    return;
  }

  const archiveBlob = await createCurrentBatchArchive(args);
  if (!archiveBlob) {
    return;
  }

  if (isBatchFinishStale(args.state, args.requestId)) {
    return;
  }

  const saved = await saveBatchArchiveOrReportFailure({ ...args, archiveBlob, filename });
  if (!saved) {
    return;
  }

  if (isBatchFinishStale(args.state, args.requestId)) {
    return;
  }

  applyBatchArchiveSuccess({
    errors: args.errors,
    filename,
    pagePackages: args.pagePackages,
    requestId: args.requestId,
    state: args.state,
  });
}
