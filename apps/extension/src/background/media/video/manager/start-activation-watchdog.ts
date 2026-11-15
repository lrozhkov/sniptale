import { runBestEffort } from '@sniptale/foundation/best-effort';
import { VideoRecordingFailureCode } from '@sniptale/runtime-contracts/video/types/types';
import { createLogger } from '@sniptale/platform/observability/logger';
import { RECORDING_START_ACTIVATION_TIMEOUT_MS } from '@sniptale/runtime-contracts/video/types/timeouts';
import { getVideoRecordingId, isVideoRecordingPreparationInProgress } from '../session-state';
import { failRecordingStartAfterTimeout } from '../runtime/recording-completion';

const logger = createLogger({ namespace: 'BackgroundVideoStartActivationWatchdog' });

type WatchdogDeps = {
  getRecordingId: () => string | null;
  isPreparing: () => boolean;
  failStart: (recordingId: string, error: string) => Promise<void>;
};

const defaultDeps: WatchdogDeps = {
  getRecordingId: getVideoRecordingId,
  isPreparing: isVideoRecordingPreparationInProgress,
  failStart: failRecordingStartAfterTimeout,
};

let activationTimer: ReturnType<typeof setTimeout> | null = null;
let activationRecordingId: string | null = null;

function isRecordingStartActivationStillTimedOut(recordingId: string, deps: WatchdogDeps): boolean {
  return deps.getRecordingId() === recordingId && deps.isPreparing();
}

export function clearRecordingStartActivationWatchdog(recordingId?: string): void {
  if (recordingId !== undefined && activationRecordingId !== recordingId) {
    return;
  }

  if (activationTimer !== null) {
    clearTimeout(activationTimer);
  }
  activationTimer = null;
  activationRecordingId = null;
}

export function scheduleRecordingStartActivationWatchdog(
  recordingId: string,
  deps: WatchdogDeps = defaultDeps
): void {
  clearRecordingStartActivationWatchdog();
  activationRecordingId = recordingId;
  activationTimer = setTimeout(() => {
    activationTimer = null;
    activationRecordingId = null;
    if (!isRecordingStartActivationStillTimedOut(recordingId, deps)) {
      return;
    }

    runBestEffort(
      deps.failStart(recordingId, VideoRecordingFailureCode.START_ACTIVATION_TIMEOUT),
      logger,
      'Failed to complete recording start timeout cleanup',
      { recordingId }
    );
  }, RECORDING_START_ACTIVATION_TIMEOUT_MS);
}
