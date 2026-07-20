import { createLogger } from '@sniptale/platform/observability/logger';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { RECORDING_START_DELIVERY_TIMEOUT_MS } from '@sniptale/runtime-contracts/video/types/timeouts';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

import { translate } from '../../../../platform/i18n';
import { getBackgroundRuntimeMessaging } from '../../../routing-contracts/runtime-messaging/services';
import { issueCameraRecorderLaunchToken } from '../runtime/camera-recorder-control';
import {
  clearActiveVideoRecordingLease,
  issueActiveVideoRecordingLease,
} from '../recording-control-lease';
import { finalizeRecordingStart } from './flow';
import {
  clearRecordingStartActivationWatchdog,
  scheduleRecordingStartActivationWatchdog,
} from './start-activation-watchdog';
import {
  clearVideoRecordingOffscreenStartDispatched,
  markVideoRecordingOffscreenStartDispatched,
} from '../session-state';

const logger = createLogger({ namespace: 'BackgroundVideoStartDelivery' });

export type RecordingStartResult =
  | { cameraLaunchToken?: string; controlToken: string; recordingId: string; result: 'accepted' }
  | { result: 'already-active' | 'cancelled' | 'duplicate-preparing' }
  | { error: string; result: 'failed' };

async function finalizeRecordingStartWithTimeout(
  context: Parameters<typeof finalizeRecordingStart>[0],
  shouldAbortBeforeOffscreenStart: () => boolean
): Promise<void> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      finalizeRecordingStart({
        ...context,
        onBeforeOffscreenStartDispatch: markVideoRecordingOffscreenStartDispatched,
        shouldAbortBeforeOffscreenStart,
      }),
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(translate('background.runtime.recordingStartTimeout')));
        }, RECORDING_START_DELIVERY_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function requestOffscreenStartCleanup(recordingId: string): Promise<void> {
  await getBackgroundRuntimeMessaging()
    .sendRuntimeMessage(
      attachOffscreenCommandCapability({
        type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
        discard: true,
      })
    )
    .catch((error: unknown) => {
      logger.warn('Failed to request offscreen cleanup after start delivery failure', {
        error,
        recordingId,
      });
    });
}

export async function finalizeAcceptedRecordingStart(
  recordingId: string,
  context: Parameters<typeof finalizeRecordingStart>[0],
  ownerSenderUrl: string
): Promise<RecordingStartResult> {
  const lease = await issueActiveVideoRecordingLease({
    captureMode: context.captureMode,
    ownerSenderUrl,
    openEditorAfterRecording: context.settings.openEditorAfterRecording,
  });
  if (!lease) throw new Error('Failed to issue recording control capability');

  let deliveryTimedOut = false;
  try {
    await finalizeRecordingStartWithTimeout(context, () => deliveryTimedOut);
    scheduleRecordingStartActivationWatchdog(recordingId);
    return {
      ...(context.captureMode === CaptureMode.CAMERA
        ? { cameraLaunchToken: issueCameraRecorderLaunchToken(recordingId) }
        : {}),
      controlToken: lease.controlToken,
      recordingId,
      result: 'accepted',
    };
  } catch (error) {
    deliveryTimedOut = true;
    clearVideoRecordingOffscreenStartDispatched();
    clearRecordingStartActivationWatchdog(recordingId);
    await clearActiveVideoRecordingLease(recordingId).catch(() => undefined);
    await requestOffscreenStartCleanup(recordingId);
    throw error;
  }
}
