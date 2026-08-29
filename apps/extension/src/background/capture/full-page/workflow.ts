import { createLogger } from '@sniptale/platform/observability/logger';
import { loadSettings } from '../../../composition/persistence/settings';
import {
  DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES,
  DEFAULT_FULL_PAGE_QUALITY_POLICY,
  FULL_PAGE_QUALITY_ABSOLUTE_LIMITS,
} from '../../../contracts/full-page-capture';
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
import { captureAndStitchFullPageTiles, FULL_PAGE_EXTENT_GREW_ERROR } from './capture-parts';
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
import { FULL_PAGE_FILE_BUDGET_ERROR, FULL_PAGE_RASTER_BUDGET_ERROR } from './budgets';
import { assertFullPageViewportFallbackWithinPolicy } from './fallback-admission';

const logger = createLogger({ namespace: 'BackgroundFullPageCapture' });
// Content-side preparation can legitimately spend up to ~24 s on fonts, bounded lazy-content
// warm-up, and final stabilization. Keep a margin so the background watchdog does not race the
// producer's own deterministic ceiling.
const PAGE_PREPARATION_TIMEOUT_MS = 35_000;
const VIEWPORT_CHANGED_DURING_CAPTURE_ERROR = 'Full-page capture viewport changed during capture';
const VIEWPORT_FALLBACK_WARNING = [
  'Full-page coverage was unavailable because the page kept changing during capture;',
  'a visible viewport image was retained instead.',
].join(' ');
const QUALITY_FALLBACK_WARNING = [
  'The page exceeded the configured full-page image limits;',
  'a visible viewport image was retained instead.',
].join(' ');

function isFullPageQualityBudgetError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message === FULL_PAGE_RASTER_BUDGET_ERROR ||
      error.message === FULL_PAGE_FILE_BUDGET_ERROR)
  );
}

function isFullPageGeometryInstabilityError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    (error.message === FULL_PAGE_EXTENT_GREW_ERROR ||
      error.message === VIEWPORT_CHANGED_DURING_CAPTURE_ERROR)
  );
}

type PagePreparationOutcome =
  | { kind: 'aborted'; reason: unknown }
  | { kind: 'failed'; reason: unknown }
  | { kind: 'prepared'; page: Awaited<ReturnType<FullPagePageAgent['prepare']>> }
  | { kind: 'timed-out' };

type FullPagePageAgent = ReturnType<typeof createFullPagePageAgentTransport>;

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
  const configuredPreferences =
    args.options.preferences ?? settings.fullPageCapture ?? DEFAULT_FULL_PAGE_CAPTURE_PREFERENCES;
  const preferences = args.options.exportRunId
    ? { ...configuredPreferences, preloadLazyContent: true }
    : configuredPreferences;
  const options = { ...args.options, qualityPolicy: settings.fullPageQuality };
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
        runPreparedPageCaptureWithViewportRetry({
          abortSignal: args.abortSignal,
          agent,
          identity,
          onProgress: args.onProgress,
          options,
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

async function runPreparedPageCaptureWithViewportRetry(
  args: Parameters<typeof runPreparedPageCapture>[0]
): Promise<Omit<FullPageCaptureTransaction, 'jobId'>> {
  let completedTileCount = 0;
  const onProgress = (current: number, total: number) => {
    if (current <= completedTileCount) return;
    completedTileCount = current;
    args.onProgress?.(current, total);
  };
  try {
    return await runPreparedPageCapture({ ...args, onProgress });
  } catch (error) {
    if (!args.abortSignal?.aborted && isFullPageQualityBudgetError(error)) {
      return runReducedFullPageOrViewportFallback(args, onProgress, error);
    }
    if (
      args.abortSignal?.aborted ||
      !(error instanceof Error) ||
      (error.message !== FULL_PAGE_EXTENT_GREW_ERROR &&
        error.message !== VIEWPORT_CHANGED_DURING_CAPTURE_ERROR)
    ) {
      throw error;
    }
    logger.log(`Retrying full-page capture after page geometry stabilization: ${error.message}`);
    try {
      return await runPreparedPageCapture({
        ...args,
        onProgress,
        restartOnExtentGrowth: false,
      });
    } catch (retryError) {
      if (!args.abortSignal?.aborted && isFullPageQualityBudgetError(retryError)) {
        return runReducedFullPageOrViewportFallback(args, onProgress, retryError);
      }
      if (
        args.abortSignal?.aborted ||
        !(retryError instanceof Error) ||
        (retryError.message !== VIEWPORT_CHANGED_DURING_CAPTURE_ERROR &&
          retryError.message !== FULL_PAGE_EXTENT_GREW_ERROR)
      ) {
        throw retryError;
      }
      logger.warn(
        `Using visible viewport fallback after persistent page geometry changes: ${retryError.message}`
      );
      return runPreparedViewportFallback(args, VIEWPORT_FALLBACK_WARNING);
    }
  }
}

async function runReducedFullPageOrViewportFallback(
  args: Parameters<typeof runPreparedPageCapture>[0],
  onProgress: (current: number, total: number) => void,
  originalError: Error
): Promise<Omit<FullPageCaptureTransaction, 'jobId'>> {
  const policy = args.options.qualityPolicy ?? DEFAULT_FULL_PAGE_QUALITY_POLICY;
  if (
    args.options.exportRunId &&
    policy.minScalePercent > FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.minScalePercent
  ) {
    logger.warn(
      `Retrying export capture at the minimum safe full-page scale: ${originalError.message}`
    );
    try {
      return await runPreparedPageCapture({
        ...args,
        onProgress,
        options: {
          ...args.options,
          qualityPolicy: {
            ...policy,
            minScalePercent: FULL_PAGE_QUALITY_ABSOLUTE_LIMITS.minScalePercent,
            profile: 'custom',
          },
        },
        restartOnExtentGrowth: false,
      });
    } catch (retryError) {
      if (
        args.abortSignal?.aborted ||
        (!isFullPageQualityBudgetError(retryError) &&
          !isFullPageGeometryInstabilityError(retryError))
      ) {
        throw retryError;
      }
      logger.warn(`Minimum-scale full-page export retry failed: ${retryError.message}`);
    }
  }
  logger.warn(
    `Using visible viewport fallback after full-page quality limit: ${originalError.message}`
  );
  return runPreparedViewportFallback(args, QUALITY_FALLBACK_WARNING);
}

async function runPreparedViewportFallback(
  args: Parameters<typeof runPreparedPageCapture>[0],
  warning: string
): Promise<Omit<FullPageCaptureTransaction, 'jobId'>> {
  let prepared = false;
  try {
    args.onPagePrepared();
    const page = await preparePageWithCancellation({
      abortSignal: args.abortSignal,
      agent: args.agent,
      identity: args.identity,
      onRestored: args.onPageRestored,
      preferences: args.preferences,
    });
    prepared = true;
    throwIfFullPageCaptureAborted(args.abortSignal);
    const dataUrl = await args.raster.captureFrame(args.abortSignal);
    throwIfFullPageCaptureAborted(args.abortSignal);
    const fallbackDimensions = await assertFullPageViewportFallbackWithinPolicy({
      dataUrl,
      policy: args.options.qualityPolicy ?? DEFAULT_FULL_PAGE_QUALITY_POLICY,
      ...(args.abortSignal === undefined ? {} : { signal: args.abortSignal }),
    });
    throwIfFullPageCaptureAborted(args.abortSignal);
    const { viewportHeight, viewportWidth } = page.geometry;
    return {
      dataUrl,
      metadata: {
        captureGeometry: page.geometry,
        cssHeight: viewportHeight,
        cssWidth: viewportWidth,
        downscaled: false,
        frozenExtentWarning: false,
        outputHeight: fallbackDimensions.height,
        outputScale: fallbackDimensions.width / viewportWidth,
        outputWidth: fallbackDimensions.width,
        viewportFallback: true,
        warnings: [...page.warnings, warning],
      },
    };
  } finally {
    if (prepared) {
      await args.agent.restore(args.identity);
      args.onPageRestored();
    }
  }
}

async function runPreparedPageCapture(args: {
  abortSignal?: AbortSignal | undefined;
  agent: FullPagePageAgent;
  identity: FullPageCaptureSessionIdentity;
  onProgress?: ((current: number, total: number) => void) | undefined;
  options: FullPageCaptureOptions;
  onPagePrepared(): void;
  onPageRestored(): void;
  preferences: FullPageCapturePreferences;
  raster: FullPageRasterBackend;
  restartOnExtentGrowth?: boolean | undefined;
  renewLease(): Promise<void>;
}): Promise<Omit<FullPageCaptureTransaction, 'jobId'>> {
  let prepared = false;
  let heartbeat: ReturnType<typeof startFullPageCaptureHeartbeat> | null = null;
  let result: Omit<FullPageCaptureTransaction, 'jobId'> | null = null;
  let failure: unknown = null;
  try {
    args.onPagePrepared();
    prepared = true;
    const page = await preparePageWithCancellation({
      abortSignal: args.abortSignal,
      agent: args.agent,
      identity: args.identity,
      onRestored: () => {
        prepared = false;
        args.onPageRestored();
      },
      preferences: args.preferences,
    });
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
      plans: createFullPageTilePlan(page.geometry, args.options.qualityPolicy),
      raster: args.raster,
      restartOnExtentGrowth: args.restartOnExtentGrowth,
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

async function preparePageWithCancellation(args: {
  abortSignal?: AbortSignal | undefined;
  agent: FullPagePageAgent;
  identity: FullPageCaptureSessionIdentity;
  onRestored(): void;
  preferences: FullPageCapturePreferences;
}): Promise<Awaited<ReturnType<FullPagePageAgent['prepare']>>> {
  throwIfFullPageCaptureAborted(args.abortSignal);
  const preparation = args.agent.prepare(args.identity, args.preferences, args.abortSignal);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let removeAbortListener: () => void = () => {};
  const abortOutcome = new Promise<PagePreparationOutcome>((resolve) => {
    const abort = () => resolve({ kind: 'aborted', reason: args.abortSignal?.reason });
    if (args.abortSignal?.aborted) abort();
    else {
      args.abortSignal?.addEventListener('abort', abort, { once: true });
      removeAbortListener = () => args.abortSignal?.removeEventListener('abort', abort);
    }
  });
  const timeoutOutcome = new Promise<PagePreparationOutcome>((resolve) => {
    timeoutId = setTimeout(() => resolve({ kind: 'timed-out' }), PAGE_PREPARATION_TIMEOUT_MS);
  });
  const preparationOutcome = preparation.then<PagePreparationOutcome, PagePreparationOutcome>(
    (page) => ({ kind: 'prepared', page }),
    (reason: unknown) => ({ kind: 'failed', reason })
  );
  const outcome = await Promise.race([preparationOutcome, abortOutcome, timeoutOutcome]);
  removeAbortListener();
  if (timeoutId) clearTimeout(timeoutId);
  if (outcome.kind === 'prepared') return outcome.page;
  if (outcome.kind === 'failed') throw outcome.reason;

  // PREPARE mutates the page before replying. A concurrent RESTORE is the cancellation
  // boundary that interrupts content-side lazy loading and returns the page to its owner.
  void preparation.catch(() => undefined);
  await args.agent.restore(args.identity);
  args.onRestored();
  if (outcome.kind === 'aborted') {
    throw outcome.reason instanceof Error
      ? outcome.reason
      : new Error('Full-page capture cancelled');
  }
  throw new Error('Full-page capture page preparation timed out');
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
        const wasCancelled = abortSignal?.aborted === true;
        if (wasCancelled) {
          logger.debug('Full-page capture cancelled by the user');
        } else {
          logger.error('Full-page capture failed', error);
        }
        await transitionCaptureJob(
          job.jobId,
          wasCancelled ? 'cancelled' : 'failed',
          wasCancelled
            ? {}
            : { error: error instanceof Error ? error.message : 'Full-page capture failed' }
        ).catch((transitionError) => {
          logger.warn(
            wasCancelled
              ? 'Failed to mark full-page capture job as cancelled'
              : 'Failed to mark full-page capture job as failed',
            transitionError
          );
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
