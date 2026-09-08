import {
  CaptureMode,
  normalizeVideoSourceCount,
} from '@sniptale/runtime-contracts/video/types/types';

import { issueCameraRecorderLaunchToken } from '../runtime/camera-recorder-control';
import { activateVideoRecordingLease } from '../recording-control-lease';
import { beginPreparedRecording } from './flow';
import { scheduleRecordingStartActivationWatchdog } from './start-activation-watchdog';
import { enableControlledCursorCapture } from '../runtime/manager/controlled-cursor/messages';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'BackgroundVideoStartDelivery' });

export type RecordingStartResult =
  | { cameraLaunchToken?: string; controlToken: string; recordingId: string; result: 'accepted' }
  | { result: 'already-active' | 'cancelled' | 'duplicate-preparing' }
  | { error: string; result: 'failed' };

export async function finalizeAcceptedRecordingStart(
  recordingId: string,
  context: {
    captureMode: CaptureMode;
    generation: number;
    tabId?: number | null;
    settings: { sourceCount?: number };
    viewportPresetId: string | null;
  },
  streamInstanceId: string
): Promise<RecordingStartResult> {
  const isMultiSource =
    context.captureMode === CaptureMode.SCREEN &&
    normalizeVideoSourceCount(context.settings.sourceCount) > 1;
  if (!isMultiSource) {
    await beginPreparedRecording({
      generation: context.generation,
      recordingId,
      streamInstanceId,
    });
    if (
      context.tabId != null &&
      (context.captureMode === CaptureMode.TAB || context.captureMode === CaptureMode.TAB_CROP)
    ) {
      try {
        // Reset preparation/countdown events only once the recorder has begun.
        await enableControlledCursorCapture(context.tabId, recordingId, 0);
      } catch {
        // Optional history must not discard a successfully started video.
        logger.warn('Action history could not start on the recording page');
      }
    }
  }
  const activeLease = await activateVideoRecordingLease({
    generation: context.generation,
    recordingId,
    streamInstanceId,
  });
  scheduleRecordingStartActivationWatchdog(recordingId);
  const cameraLaunchToken =
    context.captureMode === CaptureMode.CAMERA
      ? await issueCameraRecorderLaunchToken(recordingId)
      : null;
  return {
    ...(cameraLaunchToken === null ? {} : { cameraLaunchToken }),
    controlToken: activeLease.controlToken,
    recordingId,
    result: 'accepted',
  };
}
