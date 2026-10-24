import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { openCameraRecorderPage } from '../../../../platform/navigation/extension-pages';

import { issueCameraRecorderLaunchToken } from '../runtime/camera-recorder-control';
import { activateVideoRecordingLease } from '../recording-control-lease';
import { beginPreparedRecording } from './flow';
import { scheduleRecordingStartActivationWatchdog } from './start-activation-watchdog';
import type { VideoRecordingStartFailureCode } from '@sniptale/runtime-contracts/video/types/messages.surface';

export type RecordingStartResult =
  | {
      cameraLaunchToken?: string;
      cameraRecorderOpened?: boolean;
      controlToken: string;
      recordingId: string;
      result: 'accepted';
    }
  | { result: 'already-active' | 'cancelled' | 'duplicate-preparing' }
  | { error: string; failureCode?: VideoRecordingStartFailureCode; result: 'failed' };

export async function finalizeAcceptedRecordingStart(
  recordingId: string,
  context: {
    captureMode: CaptureMode;
    generation: number;
    tabId?: number | null;
    settings: { sourceCount?: number; teleprompterEnabled?: boolean };
    viewportPresetId: string | null;
  },
  streamInstanceId: string
): Promise<RecordingStartResult> {
  const binding = { generation: context.generation, recordingId, streamInstanceId };
  await beginPreparedRecording(binding);
  const activeLease = await activateVideoRecordingLease({
    generation: context.generation,
    recordingId,
    streamInstanceId,
  });
  scheduleRecordingStartActivationWatchdog(recordingId);
  const cameraLaunchToken =
    context.captureMode === CaptureMode.CAMERA || context.settings.teleprompterEnabled === true
      ? await issueCameraRecorderLaunchToken(recordingId)
      : null;
  let cameraRecorderOpened = false;
  if (cameraLaunchToken !== null) {
    try {
      // Delivery belongs to the accepted start, because native popup documents can close during tab preparation.
      await openCameraRecorderPage({
        launchToken: cameraLaunchToken,
        recordingId,
        ...(context.settings.teleprompterEnabled === true ? { teleprompter: true } : {}),
      });
      cameraRecorderOpened = true;
    } catch {
      // A live popup can retry the same grant without rolling back the accepted recording.
      cameraRecorderOpened = false;
    }
  }
  return {
    ...(cameraLaunchToken === null ? {} : { cameraLaunchToken, cameraRecorderOpened }),
    controlToken: activeLease.controlToken,
    recordingId,
    result: 'accepted',
  };
}
