import { useCallback } from 'react';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupRuntimeStateSlice } from '../state';
import { startRecordingHandler } from '../start-recording';

export function useStartRecordingHandler(state: PopupRuntimeStateSlice) {
  return useCallback(async () => {
    if (
      state.recording.isStartPending ||
      state.recording.recordingState.status !== VideoRecordingStatus.IDLE
    ) {
      return;
    }

    state.recording.clearStartError();
    await startRecordingHandler({
      captureMode: state.presets.videoCaptureMode,
      setIsStartPending: state.recording.setIsStartPending,
      setRecordingControlCapability: state.recording.setRecordingControlCapability,
      setStartError: state.recording.setStartError,
      videoSettings: state.recording.videoSettings,
      viewportPresetId: state.presets.selectedPresetId,
    });
  }, [state]);
}
