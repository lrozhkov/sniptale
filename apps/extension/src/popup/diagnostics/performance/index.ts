import { createLogger } from '@sniptale/platform/observability/logger';

const POPUP_PERF_FLAG_KEY = 'sniptale.popup.perf';
const logger = createLogger({ namespace: 'PopupPerf', traceEnabled: true });

type PopupPerfDetails = Record<string, unknown> | undefined;

type PopupPerfSpan = {
  end: (details?: PopupPerfDetails) => void;
  fail: (error: unknown, details?: PopupPerfDetails) => void;
};

let popupPerfEnabled: boolean | null = null;

function canUsePopupPerf(): boolean {
  return typeof window !== 'undefined' && typeof performance !== 'undefined';
}

function readPopupPerfFlag(): boolean {
  if (!canUsePopupPerf()) {
    return false;
  }

  try {
    return window.localStorage.getItem(POPUP_PERF_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function shouldLogPopupPerf(): boolean {
  if (popupPerfEnabled === null) {
    popupPerfEnabled = readPopupPerfFlag();
  }

  return popupPerfEnabled;
}

function buildPopupPerfPayload(
  label: string,
  durationMs: number,
  status: 'ok' | 'error',
  details?: PopupPerfDetails
) {
  return {
    durationMs: Number(durationMs.toFixed(1)),
    label,
    status,
    ...(details ?? {}),
  };
}

function stringifyPopupPerfError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Starts an opt-in popup performance span. Logging stays disabled until
 * `localStorage['sniptale.popup.perf'] = '1'` is set in popup DevTools.
 */
export function startPopupPerfSpan(label: string): PopupPerfSpan | null {
  if (!shouldLogPopupPerf()) {
    return null;
  }

  const startedAt = performance.now();

  return {
    end(details) {
      logger.debug(buildPopupPerfPayload(label, performance.now() - startedAt, 'ok', details));
    },
    fail(error, details) {
      logger.debug(
        buildPopupPerfPayload(label, performance.now() - startedAt, 'error', {
          ...details,
          error: stringifyPopupPerfError(error),
        })
      );
    },
  };
}

/**
 * Tracks one popup async task and logs its duration when popup perf mode is enabled.
 */
export async function trackPopupPerfAsync<T>(
  label: string,
  task: () => Promise<T>,
  details?: PopupPerfDetails
): Promise<T> {
  const span = startPopupPerfSpan(label);

  try {
    const result = await task();
    span?.end(details);
    return result;
  } catch (error) {
    span?.fail(error, details);
    throw error;
  }
}

/**
 * Finishes a popup span on the next animation frame so the log is closer to
 * the first visible frame than to the `root.render(...)` call itself.
 */
export function finishPopupPerfSpanOnNextFrame(
  span: PopupPerfSpan | null,
  details?: PopupPerfDetails
): void {
  if (!span) {
    return;
  }

  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    span.end(details);
    return;
  }

  window.requestAnimationFrame(() => {
    span.end(details);
  });
}
