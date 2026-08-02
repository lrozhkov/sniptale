import { resolveVideoViewportPresetId } from '../../../../features/viewport-presets/video-recording-policy';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
type RecordingControls = PopupVideoSetupRuntime['recording'];
type VideoSettings = PopupVideoSetupRuntime['recording']['videoSettings'];

export function createPopupVideoSetupHandlers(runtime: PopupVideoSetupRuntime) {
  const {
    setVideoCaptureMode,
    setVideoSettings,
    handleToggleMicrophone,
    handleToggleWebcam,
    clearStartError,
  } = runtime.recording;

  return {
    onCaptureModeChange: (mode: PopupVideoSetupRuntime['recording']['videoCaptureMode']) => {
      clearStartError();
      const selectedPresetId = resolveVideoViewportPresetId(
        mode,
        runtime.home.viewportPresets,
        runtime.recording.selectedPresetId
      );
      if (selectedPresetId !== runtime.recording.selectedPresetId) {
        runtime.recording.setSelectedPresetId(selectedPresetId);
      }
      setVideoCaptureMode(mode);
    },
    onPresetChange: createPresetChangeHandler(runtime, runtime.recording),
    onMicrophoneDeviceChange: (microphoneDeviceId: string | null) => {
      setVideoSettings((previous: VideoSettings) => ({
        ...previous,
        microphoneDeviceId,
      }));
    },
    onWebcamDeviceChange: (webcamDeviceId: string | null) => {
      setVideoSettings((previous: VideoSettings) => ({
        ...previous,
        webcamDeviceId,
      }));
    },
    onToggleMicrophone: () => {
      void handleToggleMicrophone();
    },
    onToggleWebcam: () => {
      void handleToggleWebcam();
    },
    onSettingsChange: (patch: Partial<PopupVideoSetupRuntime['recording']['videoSettings']>) => {
      setVideoSettings((previous: VideoSettings) => ({
        ...previous,
        ...patch,
      }));
    },
  };
}

function createPresetChangeHandler(runtime: PopupVideoSetupRuntime, recording: RecordingControls) {
  return (presetId: string | null) => {
    recording.clearStartError();
    recording.setSelectedPresetId(
      resolveVideoViewportPresetId(
        recording.videoCaptureMode,
        runtime.home.viewportPresets,
        presetId
      )
    );
  };
}
