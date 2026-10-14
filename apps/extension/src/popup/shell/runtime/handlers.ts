import { useRef } from 'react';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getPopupRuntimeServices } from '../../runtime-services';
import { getPopupRuntimeErrorMessage } from '../../diagnostics/runtime-errors';
import type { PopupVideoRuntimeStateSlice } from './types/internal-state';
import type { PopupRuntimeActionHandlers } from './types/action-handlers';
import { useToggleMicrophoneHandler } from './microphone';
import { useToggleWebcamHandler } from './webcam';
import { useStartRecordingHandler } from './start/run';
import { usePauseResumeHandler } from './transport/pause';
import { useStopHandler } from './transport/stop';
import { useUpdateRecordingSettingsHandler } from './transport/settings';

export function usePopupRuntimeHandlers(
  state: PopupVideoRuntimeStateSlice,
  getRecordingRevision: () => number
): PopupRuntimeActionHandlers {
  const refreshRequest = useRef(0);
  const setRecordingError = (error: string | null) => {
    state.recording.setRecordingState((current) => ({
      ...current,
      error,
    }));
  };
  const handleToggleMicrophone = useToggleMicrophoneHandler(state);
  const handleToggleWebcam = useToggleWebcamHandler(state);
  const handleStartRecording = useStartRecordingHandler(state);
  const handlePauseResume = usePauseResumeHandler(
    state.recording.recordingControlCapability,
    state.recording.recordingState.status,
    setRecordingError
  );
  const handleRefreshRecordingState = async () => {
    const request = ++refreshRequest.current;
    const revision = getRecordingRevision();
    const isCurrent = () =>
      request === refreshRequest.current && revision === getRecordingRevision();
    try {
      const response = await getPopupRuntimeServices().messaging.sendRuntimeMessage({
        type: VideoMessageType.GET_RECORDING_STATE,
      });
      if (!isCurrent()) return;
      if (!response?.success || !response.state) throw new Error('Recording state unavailable');
      state.recording.setRecordingState(response.state);
      state.recording.setRecordingControlCapability(
        response.recordingId && response.controlToken
          ? { recordingId: response.recordingId, controlToken: response.controlToken }
          : null
      );
    } catch (error) {
      if (!isCurrent()) return;
      setRecordingError(getPopupRuntimeErrorMessage(error, 'popup.video.stopRecordingError'));
    }
  };
  const handleStop = useStopHandler(
    state.recording.recordingControlCapability,
    setRecordingError,
    handleRefreshRecordingState
  );
  const handleUpdateRecordingSettings = useUpdateRecordingSettingsHandler(
    state.recording.recordingControlCapability,
    setRecordingError
  );

  return {
    handleToggleMicrophone,
    handleToggleWebcam,
    handleUpdateRecordingSettings,
    handleStartRecording,
    handlePauseResume,
    handleStop,
    handleRefreshRecordingState,
  };
}
