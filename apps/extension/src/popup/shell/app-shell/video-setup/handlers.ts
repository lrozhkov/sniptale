import type { ViewportPreset } from '../../../../contracts/settings';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeRequestByType } from '../../../../contracts/messaging/contracts/runtime-message';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { getPopupRuntimeErrorMessage } from '../../../diagnostics/runtime-errors';
import { getPopupRuntimeServices } from '../../runtime/services';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import {
  claimViewportPresetApplyGeneration,
  isCurrentViewportPresetApplyGeneration,
} from '../../runtime/viewport-apply-generation';

type SetViewportMessage = RuntimeRequestByType[typeof MessageType.SET_VIEWPORT];
type RecordingControls = PopupVideoSetupRuntime['recording'];
type VideoSettings = PopupVideoSetupRuntime['recording']['videoSettings'];

function resolveViewportPreset(
  viewportPresets: ViewportPreset[],
  presetId: string | null
): ViewportPreset | null {
  if (!presetId) {
    return null;
  }

  return viewportPresets.find((preset) => preset.id === presetId) ?? null;
}

async function applyViewportPresetSelection(
  runtime: PopupVideoSetupRuntime,
  presetId: string | null
): Promise<{ presetId: string | null; tabId: number | null }> {
  const preset = resolveViewportPreset(runtime.home.viewportPresets, presetId);
  const tabId = runtime.environment.activeTabCapabilities.tabId;
  const tabTarget = typeof tabId === 'number' ? { tabId } : {};
  const message: SetViewportMessage =
    preset === null
      ? { type: MessageType.SET_VIEWPORT, ...tabTarget }
      : {
          type: MessageType.SET_VIEWPORT,
          ...tabTarget,
          width: preset.width,
          height: preset.height,
        };

  await getPopupRuntimeServices().messaging.sendRuntimeMessage(message);
  return { presetId: preset?.id ?? null, tabId };
}

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
  return async (presetId: string | null) => {
    const applyGeneration = claimViewportPresetApplyGeneration();
    recording.clearStartError();
    try {
      const appliedViewport = await applyViewportPresetSelection(runtime, presetId);
      if (!isCurrentViewportPresetApplyGeneration(applyGeneration)) {
        return;
      }
      recording.setSelectedPresetId(appliedViewport.presetId);
      recording.setAppliedViewportPresetId(appliedViewport.presetId);
      recording.setAppliedViewportTabId(appliedViewport.presetId ? appliedViewport.tabId : null);
    } catch (error) {
      if (isCurrentViewportPresetApplyGeneration(applyGeneration)) {
        recording.setStartError(
          getPopupRuntimeErrorMessage(error, 'popup.video.viewportPresetApplyError')
        );
      }
    }
  };
}
