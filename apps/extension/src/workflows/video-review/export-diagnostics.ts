import { createLogger } from '@sniptale/platform/observability/logger';
import { QuickEditExportUnavailable } from './export-unavailable';

type ExportRoute = 'copy' | 'render' | 'presentation';
type Destination = 'gallery' | 'download' | 'preview';
type ReviewExportStage =
  | 'prepare'
  | 'audio-prepare'
  | 'decode'
  | 'compose'
  | 'encode'
  | 'mux-finalize'
  | 'staging-finalize'
  | 'staging-read'
  | 'publish'
  | 'release-protection'
  | 'cleanup'
  | 'download-release';
type Outcome = 'failed' | 'cleanup-failed' | 'download-release-failed';
type Metrics = { width?: number; height?: number; completedFrames?: number; bytes?: number };

const logger = createLogger({ namespace: 'ReviewExport' });

/** Original exception remains in memory; only the closed stage/code reaches diagnostics. */
class ReviewExportFailure extends Error {
  constructor(
    readonly stage: ReviewExportStage,
    cause: unknown
  ) {
    super(cause instanceof Error ? cause.message : 'Export operation failed', { cause });
  }
}

class ReviewExportCleanupFailure extends AggregateError {
  constructor(
    readonly primary: unknown,
    readonly cleanup: unknown
  ) {
    super([primary, cleanup], 'Export failed and cleanup needs recovery.', { cause: primary });
  }
}

function expected(error: unknown, signal?: AbortSignal) {
  return (
    error instanceof QuickEditExportUnavailable ||
    (error instanceof DOMException && error.name === 'AbortError') ||
    (!!signal?.aborted && Object.is(error, signal.reason))
  );
}

/** Labels the actual failed operation; an enclosing phase preserves an inner diagnosis. */
export function classifyReviewExportFailure(
  signal: AbortSignal | undefined,
  stage: ReviewExportStage,
  error: unknown
) {
  if (
    !(error instanceof ReviewExportFailure) &&
    error instanceof Error &&
    error.cause instanceof ReviewExportFailure
  )
    return new ReviewExportFailure(error.cause.stage, error);
  return error instanceof ReviewExportFailure ||
    error instanceof ReviewExportCleanupFailure ||
    expected(error, signal)
    ? error
    : new ReviewExportFailure(stage, error);
}

/** Phase belongs to this awaited operation, including concurrent audio/video work. */
export async function reviewExportPhase<T>(
  signal: AbortSignal | undefined,
  stage: ReviewExportStage,
  operation: () => T | Promise<T>
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw classifyReviewExportFailure(signal, stage, error);
  }
}

/** Cleanup cannot replace the primary cause; the existing workflow still receives a rejection. */
export async function cleanupReviewExportFailure(
  primary: unknown,
  operation: () => unknown | Promise<unknown>
): Promise<never> {
  try {
    await operation();
  } catch (cleanup) {
    throw new ReviewExportCleanupFailure(primary, cleanup);
  }
  throw primary;
}

/** One disposable attempt owns controlled terminal summaries, never publication or retention. */
export function createReviewExportDiagnostics(
  input: { destination: Destination; signal?: AbortSignal; route?: ExportRoute },
  sink: (summary: string) => void = (summary) => logger.info(summary)
) {
  let route = input.route;
  const metrics: Metrics = {};
  const reported = new Set<Outcome>();
  const emit = (error: unknown, fallback: ReviewExportStage, outcome: Outcome) => {
    const stage = error instanceof ReviewExportFailure ? error.stage : fallback;
    if (stage === 'cleanup') outcome = 'cleanup-failed';
    if (stage === 'download-release') outcome = 'download-release-failed';
    if (reported.has(outcome) || expected(error, input.signal)) return;
    reported.add(outcome);
    const values = Object.entries(metrics)
      .map(([key, value]) => `${key}=${value}`)
      .join(' ');
    const summary = [
      input.destination === 'preview' ? 'preview' : 'export',
      `outcome=${outcome}`,
      `route=${route ?? 'undetermined'}`,
      `destination=${input.destination}`,
      `stage=${stage}`,
      `code=${stage}-failed`,
      ...(values ? [values] : []),
    ].join(' ');
    try {
      sink(summary);
    } catch {
      /* Advisory sink failure never changes the operation. */
    }
  };
  return {
    setRoute(value: ExportRoute) {
      route = value;
    },
    setMetrics(value: Metrics) {
      for (const key of ['width', 'height', 'completedFrames', 'bytes'] as const) {
        const number = value[key];
        const limit = key === 'bytes' ? 2 ** 40 : key === 'completedFrames' ? 1_000_000_000 : 16384;
        if (typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= limit)
          metrics[key] = Math.round(number);
      }
    },
    phase<T>(stage: ReviewExportStage, operation: () => T | Promise<T>) {
      return reviewExportPhase(input.signal, stage, operation);
    },
    reportFailure(
      error: unknown,
      fallback: ReviewExportStage = 'prepare',
      outcome: Outcome = 'failed'
    ) {
      const cleanups: unknown[] = [];
      while (error instanceof ReviewExportCleanupFailure) {
        cleanups.push(error.cleanup);
        error = error.primary;
      }
      emit(error, fallback, outcome);
      for (const cleanup of cleanups) emit(cleanup, 'cleanup', 'cleanup-failed');
    },
  };
}

export type ReviewExportDiagnostics = ReturnType<typeof createReviewExportDiagnostics>;
