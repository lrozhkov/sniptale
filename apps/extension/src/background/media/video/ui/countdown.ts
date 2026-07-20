import { createLogger } from '@sniptale/platform/observability/logger';

/**
 * Polls a countdown session until it completes or a cancellation predicate flips to true.
 */
export function waitForCountdownTimer(
  sessionId: string,
  durationMs: number,
  isCancelled: () => boolean
): Promise<boolean> {
  const logger = createLogger({ namespace: 'BackgroundVideoUi:Countdown' });

  return new Promise((resolve) => {
    const startTime = Date.now();
    const pollIntervalMs = 100;

    const finish = (result: boolean) => {
      clearInterval(intervalId);
      resolve(result);
    };

    const intervalId = setInterval(() => {
      if (isCancelled()) {
        logger.debug('Countdown cancelled', sessionId);
        finish(false);
        return;
      }

      if (Date.now() - startTime >= durationMs) {
        logger.debug('Countdown completed', sessionId);
        finish(true);
      }
    }, pollIntervalMs);
  });
}
