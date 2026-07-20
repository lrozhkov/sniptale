import { createLogger } from '@sniptale/platform/observability/logger';

import { type RecordingRegion, showRecordingOverlay, wait } from './shared';

/**
 * Retries recording-overlay restoration after navigation until a retry succeeds or restore is cancelled.
 */
export async function restoreRecordingOverlayAfterNavigation(
  tabId: number,
  region: RecordingRegion,
  shouldRestore: () => boolean,
  retryDelaysMs: number[]
): Promise<void> {
  const logger = createLogger({ namespace: 'BackgroundVideoUi:OverlayRestore' });

  for (const delayMs of retryDelaysMs) {
    if (delayMs > 0) {
      await wait(delayMs);
    }

    if (!shouldRestore()) {
      return;
    }

    try {
      await showRecordingOverlay(tabId, region);
      logger.debug('Recording overlay restored after navigation');
      return;
    } catch (error) {
      logger.warn('Recording overlay restore retry failed', error);
    }
  }

  logger.warn('Failed to restore recording overlay after navigation');
}
