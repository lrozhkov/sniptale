import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import { DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES } from '../../../contracts/full-page-capture';
import type {
  FullPageCapturePreferences,
  FullPageCaptureSessionIdentity,
} from '../../../contracts/full-page-capture';
import {
  createCaptureJob,
  getCaptureJobRuntimeGeneration,
  transitionCaptureJob,
} from '../jobs/state-machine';
import { runNativeVisibleCaptureExclusive } from '../visible/coordinator';
import { captureAndStitchFullPageTiles } from './capture-parts';
import { createNativeFullPageRasterBackend } from './native-backend';
import { createFullPagePageAgentTransport } from './page-agent-transport';
import { createFullPageTilePlan } from './planner';
import type { FullPageRasterBackend } from './raster';
import {
  acquireFullPageCaptureLease,
  releaseFullPageCaptureLease,
  renewFullPageCaptureLease,
  runFullPageCaptureExclusive,
} from './session-lease';
import type { FullPageCaptureOptions, FullPageCaptureTransaction } from './types';
import { registerFullPageExportRun, throwIfFullPageCaptureAborted } from './cancellation';
import { startFullPageCaptureHeartbeat } from './heartbeat';
import { cleanupStoredFullPageCaptureLease } from './lifecycle';

const logger = createLogger({ namespace: 'BackgroundFullPageCapture' });

async function runWithRasterBackend<T>(args: {
  tabId: number;
  work(raster: FullPageRasterBackend): Promise<T>;
}): Promise<T> {
  return runNativeVisibleCaptureExclusive(async (lease) => {
    const raster = await createNativeFullPageRasterBackend({ lease, tabId: args.tabId });
    return runRasterWorkAndRelease(raster, args.work);
  });
}

async function runRasterWorkAndRelease<T>(
  raster: FullPageRasterBackend,
  work: (raster: FullPageRasterBackend) => Promise<T>
): Promise<T> {
  let result: T | undefined;
  let workFailure: unknown = null;
  try {
    result = await work(raster);
  } catch (error) {
    workFailure = error;
  }
  let releaseFailure: unknown = null;
  try {
    await raster.release();
  } catch (error) {
    releaseFailure = error;
  }
  if (workFailure && releaseFailure) {
    throw new AggregateError(
      [workFailure, releaseFailure],
      `Full-page raster work and release failed: ${String(workFailure)}; ${String(releaseFailure)}`
    );
  }
  if (workFailure) throw workFailure;
  if (releaseFailure) throw releaseFailure;
  return result as T;
}

async function settleFullPageCaptureLease(args: {
  failure: unknown;
  leaseAcquired: boolean;
  ownerToken: string;
  pageRestorePending: boolean;
  result: Omit<FullPageCaptureTransaction, 'jobId'> | null;
}): Promise<Omit<FullPageCaptureTransaction, 'jobId'>> {
  let cleanupFailure: unknown = null;
  const canRelease = args.leaseAcquired && !args.pageRestorePending;
  if (canRelease) {
    try {
      await releaseFullPageCaptureLease(args.ownerToken);
    } catch (error) {
      cleanupFailure = error;
    }
  }
  if (args.failure && cleanupFailure) {
    throw new AggregateError(
      [args.failure, cleanupFailure],
      'Full-page capture and cleanup failed'
    );
  }
  if (args.failure) throw args.failure;
  if (cleanupFailure) {
    throw new AggregateError([cleanupFailure], 'Full-page capture cleanup failed');
  }
  if (!args.result) throw new Error('Full-page capture did not produce an image');
  return args.result;
}

async function runFullPageCapture(args: {
  abortSignal?: AbortSignal | undefined;
  jobId: string;
  onProgress?: ((current: number, total: number) => void) | undefined;
  options: FullPageCaptureOptions;
  tabId: number;
}): Promise<Omit<FullPageCaptureTransaction, 'jobId'>> {
  const documentId = args.options.documentId;
  if (!documentId) throw new Error('Full-page capture document binding is unavailable');
  const ownerToken = crypto.randomUUID();
  const identity: FullPageCaptureSessionIdentity = {
    jobId: args.jobId,
    ownerToken,
    runtimeGeneration: getCaptureJobRuntimeGeneration(),
  };
  const settings = await loadSettings();
  const preferences =
    args.options.preferences ?? settings.fullPageCapture ?? DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES;
  const agent = createFullPagePageAgentTransport({ documentId, tabId: args.tabId });
  let result: Omit<FullPageCaptureTransaction, 'jobId'> | null = null;
  let failure: unknown = null;
  let leaseAcquired = false;
  let pageRestorePending = false;

  try {
    await cleanupStoredFullPageCaptureLease();
    await acquireFullPageCaptureLease({
      backendKind: 'native',
      documentId,
      ...(args.options.exportRunId === undefined ? {} : { exportRunId: args.options.exportRunId }),
      ...identity,
      tabId: args.tabId,
    });
    leaseAcquired = true;
    throwIfFullPageCaptureAborted(args.abortSignal);
    result = await runWithRasterBackend({
      tabId: args.tabId,
      work: (raster) =>
        runPreparedPageCapture({
          abortSignal: args.abortSignal,
          agent,
          identity,
          onProgress: args.onProgress,
          options: args.options,
          preferences,
          raster,
          renewLease: () => renewFullPageCaptureLease(ownerToken),
          onPagePrepared: () => {
            pageRestorePending = true;
          },
          onPageRestored: () => {
            pageRestorePending = false;
          },
        }),
    });
  } catch (error) {
    failure = error;
  }

  return settleFullPageCaptureLease({
    failure,
    leaseAcquired,
    ownerToken,
    pageRestorePending,
    result,
  });
}

async function runPreparedPageCapture(args: {
  abortSignal?: AbortSignal | undefined;
  agent: ReturnType<typeof createFullPagePageAgentTransport>;
  identity: FullPageCaptureSessionIdentity;
  onProgress?: ((current: number, total: number) => void) | undefined;
  options: FullPageCaptureOptions;
  onPagePrepared(): void;
  onPageRestored(): void;
  preferences: FullPageCapturePreferences;
  raster: FullPageRasterBackend;
  renewLease(): Promise<void>;
}): Promise<Omit<FullPageCaptureTransaction, 'jobId'>> {
  let prepared = false;
  let heartbeat: ReturnType<typeof startFullPageCaptureHeartbeat> | null = null;
  let result: Omit<FullPageCaptureTransaction, 'jobId'> | null = null;
  let failure: unknown = null;
  try {
    const page = await args.agent.prepare(args.identity, args.preferences);
    prepared = true;
    args.onPagePrepared();
    heartbeat = startFullPageCaptureHeartbeat({
      agent: args.agent,
      externalSignal: args.abortSignal,
      identity: args.identity,
      renewLease: args.renewLease,
    });
    throwIfFullPageCaptureAborted(heartbeat.signal);
    result = await captureAndStitchFullPageTiles({
      abortSignal: heartbeat.signal,
      finalizationAbortSignal: args.abortSignal,
      agent: args.agent,
      identity: args.identity,
      layoutGeneration: page.layoutGeneration,
      onProgress: args.onProgress,
      options: args.options,
      plans: createFullPageTilePlan(page.geometry),
      raster: args.raster,
      renewLease: args.renewLease,
      warnings: page.warnings,
      async beforeFinish() {
        await heartbeat?.stop();
        throwIfFullPageCaptureAborted(heartbeat?.signal);
        throwIfFullPageCaptureAborted(args.abortSignal);
        await args.agent.restore(args.identity);
        prepared = false;
        args.onPageRestored();
        throwIfFullPageCaptureAborted(args.abortSignal);
      },
    });
    throwIfFullPageCaptureAborted(args.abortSignal);
  } catch (error) {
    failure = error;
  }

  try {
    await heartbeat?.stop();
  } catch (error) {
    failure ??= error;
  }

  let restoreFailure: unknown = null;
  if (prepared) {
    try {
      await args.agent.restore(args.identity);
      args.onPageRestored();
    } catch (error) {
      restoreFailure = error;
    }
  }
  if (failure && restoreFailure) {
    throw new AggregateError(
      [failure, restoreFailure],
      `Full-page capture and page restore failed: capture: ${String(failure)}; restore: ${String(restoreFailure)}`
    );
  }
  if (failure) throw failure;
  if (restoreFailure) throw restoreFailure;
  if (!result) throw new Error('Full-page capture did not produce an image');
  return result;
}

export async function captureFullPageTransaction(
  tabId: number,
  onProgress?: (current: number, total: number) => void,
  options: FullPageCaptureOptions = {}
): Promise<FullPageCaptureTransaction> {
  const ownedExportRun = options.abortSignal
    ? null
    : registerFullPageExportRun(options.exportRunId);
  const abortSignal = options.abortSignal ?? ownedExportRun?.signal;
  try {
    throwIfFullPageCaptureAborted(abortSignal);
    const job = await createCaptureJob(tabId);
    return await runFullPageCaptureExclusive(async () => {
      try {
        throwIfFullPageCaptureAborted(abortSignal);
        await transitionCaptureJob(job.jobId, 'capturing');
        throwIfFullPageCaptureAborted(abortSignal);
        const captured = await runFullPageCapture({
          abortSignal,
          jobId: job.jobId,
          onProgress,
          options,
          tabId,
        });
        throwIfFullPageCaptureAborted(abortSignal);
        await transitionCaptureJob(job.jobId, 'rendering');
        throwIfFullPageCaptureAborted(abortSignal);
        logger.log('Full-page capture completed', {
          backendKind: options.backendKind ?? 'native',
          outputHeight: captured.metadata.outputHeight,
          outputWidth: captured.metadata.outputWidth,
          tabId,
        });
        return { ...captured, jobId: job.jobId };
      } catch (error) {
        logger.error('Full-page capture failed', error);
        await transitionCaptureJob(job.jobId, 'failed', {
          error: error instanceof Error ? error.message : 'Full-page capture failed',
        }).catch((transitionError) => {
          logger.warn('Failed to mark full-page capture job as failed', transitionError);
        });
        throw error;
      }
    });
  } finally {
    ownedExportRun?.release();
  }
}

export async function captureFullPage(
  tabId: number,
  onProgress?: (current: number, total: number) => void,
  options: FullPageCaptureOptions = {}
): Promise<string> {
  const ownedExportRun = options.abortSignal
    ? null
    : registerFullPageExportRun(options.exportRunId);
  const abortSignal = options.abortSignal ?? ownedExportRun?.signal;
  try {
    const transaction = await captureFullPageTransaction(tabId, onProgress, {
      ...options,
      ...(abortSignal === undefined ? {} : { abortSignal }),
    });
    throwIfFullPageCaptureAborted(abortSignal);
    await transitionCaptureJob(transaction.jobId, 'completed');
    throwIfFullPageCaptureAborted(abortSignal);
    return transaction.dataUrl;
  } finally {
    ownedExportRun?.release();
  }
}
