import { browserWindows } from '@sniptale/platform/browser/windows';
import { createLogger } from '@sniptale/platform/observability/logger';
import {
  ensureActiveVideoRecordingLeaseHydrated,
  handleTabRecordingWindowBoundsChanged,
} from '../../../media/lifecycle';

const logger = createLogger({ namespace: 'BackgroundRuntimeWindowBoundsWiring' });

function runWithVideoLeaseHydrationFallback(windowId: number): void {
  try {
    if (handleTabRecordingWindowBoundsChanged(windowId)) return;
  } catch (error) {
    logger.warn('Failed to process recording window resize from active state', error);
    return;
  }
  void ensureActiveVideoRecordingLeaseHydrated()
    .then(() => handleTabRecordingWindowBoundsChanged(windowId))
    .catch((error) => {
      logger.warn('Failed to process recording window resize after lease hydration', error);
    });
}

export function registerWindowBoundsListener(): void {
  browserWindows.subscribeBoundsChanged((window) => {
    if (window.id === undefined) return;
    runWithVideoLeaseHydrationFallback(window.id);
  });
}
