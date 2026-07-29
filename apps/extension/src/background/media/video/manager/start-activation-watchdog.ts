import { runBestEffort } from '@sniptale/foundation/best-effort';
import { translate } from '../../../../platform/i18n';
import { createLogger } from '@sniptale/platform/observability/logger';
import { RECORDING_START_ACTIVATION_TIMEOUT_MS } from '@sniptale/runtime-contracts/video/types/timeouts';
import { getVideoRecordingId, isVideoRecordingPreparationInProgress } from '../session-state';
import { notifyRecordingStartFailed } from '../runtime/manager';
import { clearActiveVideoRecordingLease } from '../recording-control-lease';
import { getActiveVideoRecordingLeaseSnapshot } from '../recording-control-lease';
import {
  requestBoundOffscreenRecordingStop,
  type RecordingSourceBinding,
} from '../offscreen-recording-stop';

const logger = createLogger({ namespace: 'BackgroundVideoStartActivationWatchdog' });

type WatchdogDeps = {
  getRecordingId: () => string | null;
  isPreparing: () => boolean;
  clearActiveLease: (
    recordingId?: string,
    options?: { shouldClear?: () => boolean }
  ) => Promise<void>;
  notifyStartFailed: (error: string) => void | Promise<void>;
  getSourceBinding: (recordingId: string) => RecordingSourceBinding | null;
  stopOffscreenRecording: (binding: RecordingSourceBinding) => Promise<boolean>;
  translate: (key: 'background.runtime.recordingStartTimeout') => string;
};

const defaultDeps: WatchdogDeps = {
  getRecordingId: getVideoRecordingId,
  isPreparing: isVideoRecordingPreparationInProgress,
  clearActiveLease: clearActiveVideoRecordingLease,
  notifyStartFailed: notifyRecordingStartFailed,
  getSourceBinding: (recordingId) => {
    const lease = getActiveVideoRecordingLeaseSnapshot();
    return lease?.recordingId === recordingId && lease.surfaceBinding
      ? { recordingId, ...lease.surfaceBinding }
      : null;
  },
  stopOffscreenRecording: (binding) =>
    requestBoundOffscreenRecordingStop(binding, true).then(() => true),
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
  const binding = deps.getSourceBinding(recordingId);
  if (!binding) {
    logger.warn('Retaining recording authority after activation timeout without source binding', {
      recordingId,
    });
    return;
  }

  try {
    if ((await deps.stopOffscreenRecording(binding)) !== true) {
      throw new Error('Offscreen recording stop acknowledgement missing');
    }
  } catch (error) {
    logger.warn('Retaining recording authority after activation-timeout cleanup failure', {
      error,
      recordingId,
    });
    return;
  }

  await deps.notifyStartFailed(deps.translate('background.runtime.recordingStartTimeout'));
  await deps.clearActiveLease(recordingId);
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
