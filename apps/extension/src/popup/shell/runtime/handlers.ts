import type { PopupRuntimeStateSlice } from './state';
import type { PopupRuntimeActionHandlers } from './types/action-handlers';
import { useToggleMicrophoneHandler } from './microphone';
import { useToggleWebcamHandler } from './webcam';
import { useStartRecordingHandler } from './start/run';
import { usePauseResumeHandler } from './transport/pause';
import { useStopHandler } from './transport/stop';
import { useUpdateRecordingSettingsHandler } from './transport/settings';

export function usePopupRuntimeHandlers(state: PopupRuntimeStateSlice): PopupRuntimeActionHandlers {
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
  const handleStop = useStopHandler(state.recording.recordingControlCapability, setRecordingError);
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
  };
}
