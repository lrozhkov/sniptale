import type { PopupRuntimeStateSlice } from '../state';
import type { PopupRuntimeActionHandlers } from '../types/action-handlers';
import type { PopupRuntimeRecordingState } from '../types/state';
import { assemblePopupRecordingControls } from './recording-data';

export function assemblePopupRecordingState(
  state: PopupRuntimeStateSlice,
  handlers: PopupRuntimeActionHandlers
): PopupRuntimeRecordingState {
  return {
    ...assemblePopupRecordingControls(state),
    handleToggleMicrophone: handlers.handleToggleMicrophone,
    handleToggleWebcam: handlers.handleToggleWebcam,
    handleUpdateRecordingSettings: handlers.handleUpdateRecordingSettings,
    handleStartRecording: handlers.handleStartRecording,
    handlePauseResume: handlers.handlePauseResume,
    handleStop: handlers.handleStop,
  };
}
