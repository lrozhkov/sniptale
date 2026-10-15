import { runBestEffort } from '@sniptale/foundation/best-effort';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { RECORDING_START_ACTIVATION_TIMEOUT_MS } from '@sniptale/runtime-contracts/video/types/timeouts';
import { getVideoRecordingId, isVideoRecordingPreparationInProgress } from '../session-state';
import { failRecordingStartAfterTimeout } from '../runtime/recording-completion';

const logger = createLogger({ namespace: 'BackgroundVideoStartActivationWatchdog' });

type WatchdogDeps = {
  getRecordingId: () => string | null;
  isPreparing: () => boolean;
  failStart: (recordingId: string, error: string) => Promise<void>;
  translate: (key: 'background.runtime.recordingStartTimeout') => string;
};

const defaultDeps: WatchdogDeps = {
  getRecordingId: getVideoRecordingId,
  isPreparing: isVideoRecordingPreparationInProgress,
  failStart: failRecordingStartAfterTimeout,
  translate,
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
      deps.failStart(recordingId, deps.translate('background.runtime.recordingStartTimeout')),
      logger,
      'Failed to complete recording start timeout cleanup',
      { recordingId }
    );
  }, RECORDING_START_ACTIVATION_TIMEOUT_MS);
}
