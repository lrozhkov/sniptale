import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

export function getPauseResumeMessageType(
  recordingStatus: VideoRecordingStatus
): VideoMessageType.PAUSE_RECORDING | VideoMessageType.RESUME_RECORDING {
  return recordingStatus === VideoRecordingStatus.PAUSED
    ? VideoMessageType.RESUME_RECORDING
    : VideoMessageType.PAUSE_RECORDING;
}
