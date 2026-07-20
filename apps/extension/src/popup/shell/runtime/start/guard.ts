import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

export function canStartPopupRecording(options: {
  isStartPending: boolean;
  recordingStatus: VideoRecordingStatus;
}): boolean {
  return !options.isStartPending && options.recordingStatus === VideoRecordingStatus.IDLE;
}
