import {
  CaptureMode,
  normalizeVideoSourceCount,
} from '@sniptale/runtime-contracts/video/types/types';

import { issueCameraRecorderLaunchToken } from '../runtime/camera-recorder-control';
import { activateVideoRecordingLease } from '../recording-control-lease';
import { beginPreparedRecording } from './flow';
import { scheduleRecordingStartActivationWatchdog } from './start-activation-watchdog';
import {
  createRecordingFrameClockCompanion,
  closeRecordingFrameClockCompanions,
} from './frame-clock-companion';
import type { VideoRecordingStartFailureCode } from '@sniptale/runtime-contracts/video/types/messages.surface';

export type RecordingStartResult =
  | { cameraLaunchToken?: string; controlToken: string; recordingId: string; result: 'accepted' }
  | { result: 'already-active' | 'cancelled' | 'duplicate-preparing' }
  | { error: string; failureCode?: VideoRecordingStartFailureCode; result: 'failed' };

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
    const binding = { generation: context.generation, recordingId, streamInstanceId };
    const needsClock =
      context.captureMode === CaptureMode.TAB || context.captureMode === CaptureMode.TAB_CROP;
    const frameClockLease = needsClock
      ? await createRecordingFrameClockCompanion(binding)
      : undefined;
    try {
      await beginPreparedRecording({
        ...binding,
        ...(frameClockLease === undefined ? {} : { frameClockLease }),
      });
    } catch (error) {
      await closeRecordingFrameClockCompanions(recordingId);
      throw error;
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
