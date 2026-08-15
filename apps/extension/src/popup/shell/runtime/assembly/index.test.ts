import { expect, it, vi } from 'vitest';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { getTabCapabilities } from '../../../../features/tab-capabilities/capabilities';
import { IDLE_RECORDING_STATE } from '../../../recording/video/copy';
import type { PopupVideoRuntimeStateSlice } from '../types/internal-state';
import { assemblePopupVideoRuntimeState } from '.';

it('projects only the Video route runtime surface', () => {
  const handler = vi.fn();
  const state = createVideoState();
  const runtime = assemblePopupVideoRuntimeState(
    state,
    {
      handlePauseResume: handler,
      handleStartRecording: handler,
      handleStop: handler,
      handleToggleMicrophone: handler,
      handleToggleWebcam: handler,
      handleUpdateRecordingSettings: handler,
    },
    {
      disabledReason: null,
      error: null,
      handleRequest: vi.fn(),
      loading: false,
      pendingOperation: null,
      status: null,
    }
  );

  expect(runtime.viewportPresets).toEqual([]);
  expect(runtime.recording.handleStartRecording).toBe(handler);
  expect(runtime.environment.activeTabCapabilities).toBe(state.environment.activeTabCapabilities);
  expect(runtime).not.toHaveProperty('navigation');
});

function createVideoState(): PopupVideoRuntimeStateSlice {
  const noDevices = vi.fn(async () => []);
  return {
    actions: { refreshMicrophones: noDevices, refreshWebcams: noDevices },
    devices: {
      microphoneDevices: [],
      isLoadingMicrophones: false,
      webcamDevices: [],
      isLoadingWebcams: false,
      setMicrophoneDevices: vi.fn(),
      setWebcamDevices: vi.fn(),
      setIsLoadingMicrophones: vi.fn(),
      setIsLoadingWebcams: vi.fn(),
    },
    environment: {
      activeTabCapabilities: getTabCapabilities(null),
      galleryStatus: null,
      setActiveTabCapabilities: vi.fn(),
      setGalleryStatus: vi.fn(),
    },
    presets: {
      selectedPreset: null,
      selectedPresetId: null,
      setSelectedPresetId: vi.fn(),
      setVideoCaptureMode: vi.fn(),
      setViewportPresets: vi.fn(),
      videoCaptureMode: CaptureMode.TAB,
      viewportPresets: [],
    },
    recording: {
      recordingControlCapability: null,
      videoSettings: DEFAULT_VIDEO_SETTINGS,
      recordingState: IDLE_RECORDING_STATE,
      startError: null,
      isStartPending: false,
      recordingActive: false,
      setVideoSettings: vi.fn(),
      setRecordingState: vi.fn(),
      setRecordingControlCapability: vi.fn(),
      setStartError: vi.fn(),
      setIsStartPending: vi.fn(),
      clearStartError: vi.fn(),
    },
  };
}
