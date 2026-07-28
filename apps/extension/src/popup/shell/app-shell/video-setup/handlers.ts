import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
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
      setVideoCaptureMode(mode);
      if (mode === CaptureMode.CAMERA) {
        forceCameraModeSettings(runtime);
      }
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

function forceCameraModeSettings(runtime: PopupVideoSetupRuntime): void {
  const firstWebcamDeviceId = runtime.recording.webcamDevices[0]?.deviceId ?? null;
  runtime.recording.setVideoSettings((previous: VideoSettings) => ({
    ...previous,
    controlledCursorCaptureEnabled: false,
    diagnosticsEnabled: false,
    sourceCount: 1,
    systemAudioEnabled: false,
    webcamDeviceId: previous.webcamDeviceId ?? firstWebcamDeviceId,
    webcamEnabled: true,
  }));
}

function createPresetChangeHandler(runtime: PopupVideoSetupRuntime, recording: RecordingControls) {
  return (presetId: string | null) => {
    recording.clearStartError();
    const exists = runtime.home.viewportPresets.some((preset) => preset.id === presetId);
    recording.setSelectedPresetId(exists ? presetId : null);
  };
}
