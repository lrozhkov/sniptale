import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';

export const CAPTURE_RESPONSE_TIMEOUT_MS = 60_000;

const logger = createLogger({ namespace: 'ContentScreenshotCapture' });

export async function withCaptureStepTimeout<T>({
  promise,
  step,
  timeoutMs,
}: {
  promise: Promise<T>;
  step: string;
  timeoutMs: number;
}): Promise<T> {
  logger.debug('capture.step.start', { step, timeoutMs });

  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      logger.error('capture.step.timeout', { step, timeoutMs });
      reject(new Error(translate('content.runtime.screenshotCaptureTimedOut')));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      promise.catch((error: unknown) => {
        logger.debug('capture.step.failed', { step });
        throw error;
      }),
      timeoutPromise,
    ]);
    logger.debug('capture.step.complete', { step });
    return result;
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
}
