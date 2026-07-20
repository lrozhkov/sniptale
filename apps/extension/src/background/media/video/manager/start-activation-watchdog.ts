import { runBestEffort } from '@sniptale/foundation/best-effort';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { RECORDING_START_ACTIVATION_TIMEOUT_MS } from '@sniptale/runtime-contracts/video/types/timeouts';
import { getVideoRecordingId, isVideoRecordingPreparationInProgress } from '../session-state';
import { notifyRecordingStartFailed } from '../runtime/manager';
import { clearActiveVideoRecordingLease } from '../recording-control-lease';

const logger = createLogger({ namespace: 'BackgroundVideoStartActivationWatchdog' });

type WatchdogDeps = {
  getRecordingId: () => string | null;
  isPreparing: () => boolean;
  clearActiveLease: (
    recordingId?: string,
    options?: { shouldClear?: () => boolean }
  ) => Promise<void>;
  notifyStartFailed: (error: string) => void;
  sendRuntimeMessage: (message: {
    capabilityToken: string;
    discard: true;
    type: typeof VideoMessageType.OFFSCREEN_STOP_RECORDING;
  }) => Promise<unknown>;
  translate: (key: 'background.runtime.recordingStartTimeout') => string;
};

const defaultDeps: WatchdogDeps = {
  getRecordingId: getVideoRecordingId,
  isPreparing: isVideoRecordingPreparationInProgress,
  clearActiveLease: clearActiveVideoRecordingLease,
  notifyStartFailed: notifyRecordingStartFailed,
  sendRuntimeMessage: (message) => getBackgroundRuntimeMessaging().sendRuntimeMessage(message),
  translate,
};

let activationTimer: ReturnType<typeof setTimeout> | null = null;
let activationRecordingId: string | null = null;

function isRecordingStartActivationStillTimedOut(recordingId: string, deps: WatchdogDeps): boolean {
  return deps.getRecordingId() === recordingId && deps.isPreparing();
}

async function handleRecordingStartActivationTimeout(
  recordingId: string,
  deps: WatchdogDeps
): Promise<void> {
  try {
    await deps.clearActiveLease(recordingId, {
      shouldClear: () => isRecordingStartActivationStillTimedOut(recordingId, deps),
    });
  } catch (error) {
    logger.warn('Failed to clear recording control lease after recording start timeout', {
      error,
      recordingId,
    });
    return;
  }

  if (!isRecordingStartActivationStillTimedOut(recordingId, deps)) {
    return;
  }

  deps.notifyStartFailed(deps.translate('background.runtime.recordingStartTimeout'));
  runBestEffort(
    deps.sendRuntimeMessage({
      ...attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
        discard: true,
      }),
    }),
    logger,
    'Failed to request offscreen cleanup after recording start timeout',
    { recordingId }
  );
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
      handleRecordingStartActivationTimeout(recordingId, deps),
      logger,
      'Failed to complete recording start timeout cleanup',
      { recordingId }
    );
  }, RECORDING_START_ACTIVATION_TIMEOUT_MS);
}
