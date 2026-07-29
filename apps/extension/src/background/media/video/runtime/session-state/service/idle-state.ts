import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';

export function createIdleState(): VideoRecordingRuntimeState {
  return {
    status: VideoRecordingStatus.IDLE,
    duration: 0,
    countdownEndsAt: null,
    captureMode: null,
    captureSource: null,
    viewportPresetId: null,
    liveMedia: null,
    error: null,
  };
}
