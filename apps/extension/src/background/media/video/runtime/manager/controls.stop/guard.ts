import { createLogger } from '@sniptale/platform/observability/logger';
import {
  getVideoRecordingCountdownSessionId,
  hasActiveVideoRecordingSession,
  isVideoRecordingPreparationInProgress,
  isVideoRecordingStopInProgress,
} from '../../../session-state';

const logger = createLogger({ namespace: 'BackgroundVideoRuntimeControls' });

export function shouldSkipStop(): boolean {
  if (isVideoRecordingStopInProgress()) {
    logger.warn('Ignoring duplicate stop request while stop is already in progress');
    return true;
  }

  if (
    !hasActiveVideoRecordingSession() &&
    !isVideoRecordingPreparationInProgress() &&
    getVideoRecordingCountdownSessionId() === null
  ) {
    logger.warn('Ignoring stop request because no recording is active');
    return true;
  }

  return false;
}
