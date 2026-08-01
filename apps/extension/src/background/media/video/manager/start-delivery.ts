import {
  CaptureMode,
  normalizeVideoSourceCount,
} from '@sniptale/runtime-contracts/video/types/types';

import { issueCameraRecorderLaunchToken } from '../runtime/camera-recorder-control';
import { activateVideoRecordingLease } from '../recording-control-lease';
import { beginPreparedRecording } from './flow';
import { scheduleRecordingStartActivationWatchdog } from './start-activation-watchdog';

export type RecordingStartResult =
  | { cameraLaunchToken?: string; controlToken: string; recordingId: string; result: 'accepted' }
  | { result: 'already-active' | 'cancelled' | 'duplicate-preparing' }
  | { error: string; result: 'failed' };

export async function finalizeAcceptedRecordingStart(
  recordingId: string,
  context: {
    captureMode: CaptureMode;
    generation: number;
    settings: { openEditorAfterRecording: boolean; sourceCount?: number };
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
