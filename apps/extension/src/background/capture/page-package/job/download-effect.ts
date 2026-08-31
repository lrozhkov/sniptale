import type { AssetRef } from '../../../../composition/persistence/assets';
import { loadSettings } from '../../../../composition/persistence/settings';
import { defaultDownloadRouterService, executeDownloadUrl } from '../../download/download-router';
import type { DownloadTerminalState } from '../../download/download-router/service-state';
import { readDownloadInterruptionReason } from '../../download/download-router/service-state';
import { createLogger } from '@sniptale/platform/observability/logger';
import { createPagePackageDownloadOffscreenGateway } from './offscreen-download-gateway';
import {
  cleanupRecordedPagePackageOutput,
  readPagePackageJobRecoveryState,
  recordPagePackageOutputAmbiguous,
  recordPagePackageOutputCleanupFailed,
  recordPopupExportDownloadLease,
  recordPopupExportDownloadPrepared,
  recordPopupExportDownloadStarted,
  recordPopupExportDownloadStarting,
  type PersistedPagePackageOutput,
} from './storage';

type DownloadLease = Awaited<
  ReturnType<ReturnType<typeof createPagePackageDownloadOffscreenGateway>['create']>
>;
type DownloadStage =
  | 'BROWSER_INTERRUPTED'
  | 'BROWSER_TERMINAL'
  | 'DOWNLOAD_ADMISSION'
  | 'DOWNLOAD_ID_PERSIST'
  | 'LEASE_CONFIRM'
  | 'LEASE_CREATE'
  | 'LEASE_PERSIST'
  | 'OUTPUT_CLEANUP';

class PagePackageDownloadStageError extends Error {
  constructor(
    readonly stage: DownloadStage,
    cause: unknown
  ) {
    super(`Page Package download failed at ${stage}: ${errorText(cause)}`, { cause });
  }
}

const logger = createLogger({ namespace: 'BackgroundPagePackageDownload' });

async function runDownloadStage<T>(stage: DownloadStage, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    throw new PagePackageDownloadStageError(stage, error);
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function waitForDownloadOrCancellation(args: {
  downloadId: number;
  signal: AbortSignal;
  terminal: Promise<DownloadTerminalState>;
}): Promise<DownloadTerminalState> {
  let removeAbortListener: () => void = () => undefined;
  const cancellation = new Promise<DownloadTerminalState>((resolve, reject) => {
    const cancel = () => {
      void defaultDownloadRouterService
        .cancelDownloadAndWait(args.downloadId)
        .then(resolve, reject);
    };
    if (args.signal.aborted) cancel();
    else {
      args.signal.addEventListener('abort', cancel, { once: true });
      removeAbortListener = () => args.signal.removeEventListener('abort', cancel);
    }
  });
  return Promise.race([args.terminal, cancellation]).finally(removeAbortListener);
}

async function startTrackedDownload(args: {
  filename: string;
  jobId: string;
  lease: DownloadLease;
  operationId: string;
  signal: AbortSignal;
}): Promise<number> {
  let resolveTerminal!: (state: DownloadTerminalState) => void;
  const terminal = new Promise<DownloadTerminalState>((resolve) => {
    resolveTerminal = resolve;
  });
  const settings = await loadSettings();
  await recordPopupExportDownloadStarting({
    jobId: args.jobId,
    operationId: args.operationId,
    requestedAt: Date.now(),
  });
  const downloadId = await runDownloadStage('DOWNLOAD_ADMISSION', () =>
    executeDownloadUrl({
      filename: args.filename,
      onTerminal: resolveTerminal,
      presetId: settings.defaultExportPresetId ?? undefined,
      url: args.lease.url,
    })
  );
  if (typeof downloadId !== 'number')
    throw new Error('Page Package download did not return an id.');
  await runDownloadStage('DOWNLOAD_ID_PERSIST', () =>
    recordPopupExportDownloadStarted({
      downloadId,
      jobId: args.jobId,
      operationId: args.operationId,
    })
  );
  const gateway = createPagePackageDownloadOffscreenGateway();
  const confirmed = await runDownloadStage('LEASE_CONFIRM', () =>
    gateway.confirm({
      downloadOperationId: args.operationId,
      leaseId: args.lease.leaseId,
      signal: args.signal,
    })
  );
  if (!confirmed) {
    throw new PagePackageDownloadStageError(
      'LEASE_CONFIRM',
      'Page Package download lease was not confirmed.'
    );
  }
  const terminalState = await waitForDownloadOrCancellation({
    downloadId,
    signal: args.signal,
    terminal,
  });
  if (terminalState === 'interrupted') {
    const reason = await readDownloadInterruptionReason(downloadId);
    throw new PagePackageDownloadStageError(
      'BROWSER_INTERRUPTED',
      reason ?? 'unknown browser interruption'
    );
  }
  if (terminalState !== 'complete') {
    throw new PagePackageDownloadStageError('BROWSER_TERMINAL', terminalState);
  }
  return downloadId;
}

async function reconcileBrowserAdmission(
  jobId: string,
  output: PersistedPagePackageOutput,
  allowAbsentDownloadCleanup: boolean
): Promise<{ downloadId: number; state: chrome.downloads.DownloadItem['state'] } | null> {
  if (!output.leaseUrl || output.downloadRequestedAt === null) {
    throw new Error('Page Package download reconciliation identity is incomplete.');
  }
  let matches;
  try {
    matches = await defaultDownloadRouterService.findDownloadsByExactUrl({
      requestedAt: output.downloadRequestedAt,
      url: output.leaseUrl,
    });
  } catch (error) {
    const message = `Page Package browser download reconciliation failed: ${errorText(error)}`;
    await recordPagePackageOutputAmbiguous({
      error: message,
      jobId,
      operationId: output.downloadOperationId,
    });
    throw new Error(message, { cause: error });
  }
  if (matches.length === 0 && output.downloadId === null && allowAbsentDownloadCleanup) {
    return null;
  }
  if (
    matches.length !== 1 ||
    (output.downloadId !== null && matches[0]!.downloadId !== output.downloadId)
  ) {
    const message = `Page Package browser download reconciliation is ambiguous (${matches.length} matches).`;
    await recordPagePackageOutputAmbiguous({
      error: message,
      jobId,
      operationId: output.downloadOperationId,
    });
    throw new Error(message);
  }
  const match = matches[0]!;
  if (output.downloadId === null) {
    await recordPopupExportDownloadStarted({
      downloadId: match.downloadId,
      jobId,
      operationId: output.downloadOperationId,
    });
  }
  return match;
}

async function ensureBrowserEffectTerminal(
  jobId: string,
  output: PersistedPagePackageOutput,
  options: { allowAbsentDownloadCleanup: boolean; cancelActiveDownload: boolean }
): Promise<boolean> {
  if (output.downloadRequestedAt === null) return true;
  const match = await reconcileBrowserAdmission(jobId, output, options.allowAbsentDownloadCleanup);
  if (!match) return true;
  if (match.state === 'complete' || match.state === 'interrupted') return true;
  if (options.cancelActiveDownload) {
    await defaultDownloadRouterService.cancelDownloadAndWait(match.downloadId);
    return true;
  }
  await defaultDownloadRouterService.rememberPendingDownload(
    match.downloadId,
    () => {
      void reconcileAndCleanupPagePackageOutput(jobId).catch(() => undefined);
    },
    'generic',
    undefined,
    true
  );
  return false;
}

/** Reconciles the privileged browser effect, then releases lease and durable bytes in order. */
export async function reconcileAndCleanupPagePackageOutput(
  jobId: string,
  options: {
    allowAbsentDownloadCleanup?: boolean;
    cancelActiveDownload?: boolean;
    verifiedTerminalDownloadId?: number;
  } = {}
): Promise<void> {
  const recovery = await readPagePackageJobRecoveryState();
  const output = recovery?.jobId === jobId ? recovery.output : null;
  if (!output) return;
  try {
    const hasVerifiedTerminalEffect =
      options.verifiedTerminalDownloadId !== undefined &&
      output.downloadId === options.verifiedTerminalDownloadId;
    const terminal = hasVerifiedTerminalEffect
      ? true
      : await ensureBrowserEffectTerminal(jobId, output, {
          allowAbsentDownloadCleanup: options.allowAbsentDownloadCleanup === true,
          cancelActiveDownload: options.cancelActiveDownload === true,
        });
    if (!terminal) return;
    if (output.urlLeaseId !== null) {
      const released = await createPagePackageDownloadOffscreenGateway().release({
        downloadOperationId: output.downloadOperationId,
        leaseId: output.urlLeaseId,
      });
      if (!released) throw new Error('Page Package download lease release was not confirmed.');
    }
    await cleanupRecordedPagePackageOutput({ jobId, operationId: output.downloadOperationId });
  } catch (error) {
    const current = await readPagePackageJobRecoveryState();
    if (current?.output?.phase !== 'ambiguous-download') {
      await recordPagePackageOutputCleanupFailed({
        error: errorText(error),
        jobId,
        operationId: output.downloadOperationId,
      });
    }
    throw error;
  }
}

function throwDownloadOutcome(args: {
  cleanupError: unknown;
  jobId: string;
  operationError: unknown;
  operationId: string;
  size: number;
}): void {
  const { cleanupError, operationError } = args;
  if (operationError === undefined && cleanupError === undefined) return;
  const cause =
    operationError !== undefined && cleanupError !== undefined
      ? new AggregateError([operationError, cleanupError], 'Page Package lifecycle failure.')
      : (operationError ?? cleanupError);
  const stage =
    operationError instanceof PagePackageDownloadStageError
      ? operationError.stage
      : cleanupError === undefined
        ? 'DOWNLOAD_ADMISSION'
        : 'OUTPUT_CLEANUP';
  logger.error('Page Package download lifecycle failed', {
    cleanupError: cleanupError === undefined ? null : errorText(cleanupError),
    jobId: args.jobId,
    operationError: operationError === undefined ? null : errorText(operationError),
    operationId: args.operationId,
    size: args.size,
    stage,
  });
  throw new Error(`Page Package download could not be completed safely [${stage}].`, { cause });
}

export async function downloadPagePackageReference(args: {
  filename: string;
  jobId: string;
  reference: AssetRef;
  signal: AbortSignal;
}): Promise<void> {
  const gateway = createPagePackageDownloadOffscreenGateway();
  const operationId = crypto.randomUUID();
  await recordPopupExportDownloadPrepared({
    filename: args.filename,
    jobId: args.jobId,
    operationId,
    reference: args.reference,
  });
  let operationError: unknown;
  let verifiedTerminalDownloadId: number | undefined;
  try {
    const lease = await runDownloadStage('LEASE_CREATE', () =>
      gateway.create({
        downloadOperationId: operationId,
        filename: args.filename,
        reference: args.reference,
        signal: args.signal,
      })
    );
    await runDownloadStage('LEASE_PERSIST', () =>
      recordPopupExportDownloadLease({
        jobId: args.jobId,
        leaseId: lease.leaseId,
        leaseUrl: lease.url,
        operationId,
      })
    );
    verifiedTerminalDownloadId = await startTrackedDownload({ ...args, lease, operationId });
  } catch (error) {
    operationError = error;
  }
  let cleanupError: unknown;
  try {
    await reconcileAndCleanupPagePackageOutput(args.jobId, {
      allowAbsentDownloadCleanup: args.signal.aborted && verifiedTerminalDownloadId === undefined,
      cancelActiveDownload: true,
      ...(verifiedTerminalDownloadId === undefined ? {} : { verifiedTerminalDownloadId }),
    });
  } catch (error) {
    cleanupError = new PagePackageDownloadStageError('OUTPUT_CLEANUP', error);
  }
  throwDownloadOutcome({
    cleanupError,
    jobId: args.jobId,
    operationError,
    operationId,
    size: args.reference.size,
  });
}
