import { useCallback } from 'react';
import type { PopupRuntimeStateSlice } from '../state';
import { startRecordingHandler } from '../start-recording';
import { canStartPopupRecording } from './guard';
import { createPopupStartRecordingParams } from './params';

export function useStartRecordingHandler(state: PopupRuntimeStateSlice) {
  return useCallback(async () => {
    if (
      !canStartPopupRecording({
        isStartPending: state.recording.isStartPending,
        recordingStatus: state.recording.recordingState.status,
      })
    ) {
      return;
    }

    state.recording.clearStartError();
    await startRecordingHandler(createPopupStartRecordingParams(state));
  }, [state]);
}
