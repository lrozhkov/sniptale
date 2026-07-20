import type { PopupRuntimeStateSlice } from '../state';

type PopupStartRecordingParamState = {
  presets: Pick<PopupRuntimeStateSlice['presets'], 'videoCaptureMode'>;
  recording: Pick<
    PopupRuntimeStateSlice['recording'],
    'setIsStartPending' | 'setRecordingControlCapability' | 'setStartError' | 'videoSettings'
  >;
};

export function createPopupStartRecordingParams(state: PopupStartRecordingParamState) {
  return {
    captureMode: state.presets.videoCaptureMode,
    setIsStartPending: state.recording.setIsStartPending,
    setRecordingControlCapability: state.recording.setRecordingControlCapability,
    setStartError: state.recording.setStartError,
    videoSettings: state.recording.videoSettings,
    viewportPreset: null,
  };
}
