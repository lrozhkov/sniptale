import { createLogger } from '@sniptale/platform/observability/logger';
import { getVideoRecordingId, getVideoRecordingTabId } from '../../../session-state';
import {
  markVideoCaptureSurfaceTabClosed,
  waitForVideoCaptureSurfaceRecovery,
} from '../../../capture-surface';
import { stopRecording } from '../controls.stop';
import {
  ensureVideoRecordingSurfaceLeaseHydrated,
  getVideoRecordingSurfaceLeaseSnapshot,
  releaseVideoRecordingSurface,
} from '../../../content-surface/surface-lease';

const logger = createLogger({ namespace: 'BackgroundVideoRuntime' });

export async function handleTabClose(tabId: number): Promise<void> {
  await waitForVideoCaptureSurfaceRecovery();
  const hydratedSurface = await ensureVideoRecordingSurfaceLeaseHydrated();
  const surface = getVideoRecordingSurfaceLeaseSnapshot() ?? hydratedSurface;
  let surfaceReleaseError: unknown = null;
  if (surface?.tabId === tabId) {
    await releaseVideoRecordingSurface({ tabId }).catch((error) => {
      surfaceReleaseError = error;
      logger.warn('Embedded camera surface release failed for closed tab', error);
    });
  }
  if (getVideoRecordingTabId() === tabId) {
    const recordingId = getVideoRecordingId();
    if (recordingId) {
      logger.log('Recording tab closed, stopping recording');
      markVideoCaptureSurfaceTabClosed(recordingId, tabId);
      const result = await stopRecording(false);
      if (result.result !== 'accepted') {
        throw new Error(
          result.result === 'failed'
            ? result.error
            : `Recording stop was not accepted: ${result.result}`
        );
      }
    }
  }
  if (surfaceReleaseError) {
    await releaseVideoRecordingSurface({ tabId });
  }
}
