// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupVideoRuntimeStateSlice } from '../types/internal-state';
import { useStartRecordingHandler } from './run';

const { startRecordingHandlerMock } = vi.hoisted(() => ({
  startRecordingHandlerMock: vi.fn(),
}));

vi.mock('../start-recording', () => ({
  startRecordingHandler: startRecordingHandlerMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let startRecording: (() => Promise<void>) | null = null;

function createState(
  status: VideoRecordingStatus,
  isStartPending = false
): PopupVideoRuntimeStateSlice {
  return {
    actions: {
      refreshMicrophones: vi.fn(async () => []),
      refreshWebcams: vi.fn(async () => []),
    },
    devices: {
      isLoadingMicrophones: false,
      isLoadingWebcams: false,
      microphoneDevices: [],
      setIsLoadingMicrophones: vi.fn(),
      setIsLoadingWebcams: vi.fn(),
      setMicrophoneDevices: vi.fn(),
      setWebcamDevices: vi.fn(),
      webcamDevices: [],
    },
    environment: {
      activeTabCapabilities: {
        export: { reason: null, supported: true },
        isRestrictedPage: false,
        quickActions: { reason: null, supported: true },
        restrictedPageLabel: null,
        screenshotMode: { reason: null, supported: true },
        tabId: 1,
        title: 'Example',
        url: 'https://example.test',
        videoByMode: {
          [CaptureMode.CAMERA]: { reason: null, supported: true },
          [CaptureMode.SCREEN]: { reason: null, supported: true },
          [CaptureMode.TAB]: { reason: null, supported: true },
          [CaptureMode.TAB_CROP]: { reason: null, supported: true },
        },
      },
      galleryStatus: null,
      setActiveTabCapabilities: vi.fn(),
      setGalleryStatus: vi.fn(),
    },
    presets: {
      selectedPreset: null,
      videoCaptureMode: CaptureMode.TAB,
      selectedPresetId: 'preset-1',
      setSelectedPresetId: vi.fn(),
      setVideoCaptureMode: vi.fn(),
      setViewportPresets: vi.fn(),
      viewportPresets: [],
    },
    recording: {
      clearStartError: vi.fn(),
      isStartPending,
      recordingActive: status === VideoRecordingStatus.RECORDING,
      recordingControlCapability: null,
      recordingState: {
        captureMode: null,
        captureSource: null,
        countdownEndsAt: null,
        duration: 0,
        error: null,
        status,
        viewportPresetId: null,
      },
      setIsStartPending: vi.fn(),
      setRecordingControlCapability: vi.fn(),
      setRecordingState: vi.fn(),
      setStartError: vi.fn(),
      setVideoSettings: vi.fn(),
      startError: null,
      videoSettings: DEFAULT_VIDEO_SETTINGS,
    },
  };
}

function Harness({ state }: { state: PopupVideoRuntimeStateSlice }) {
  startRecording = useStartRecordingHandler(state);
  return null;
}

async function render(state: PopupVideoRuntimeStateSlice) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Harness state={state} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  startRecordingHandlerMock.mockReset();
  startRecording = null;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('clears the previous error and delegates an idle recording start', async () => {
  const state = createState(VideoRecordingStatus.IDLE);
  await render(state);

  await act(async () => startRecording?.());

  expect(state.recording.clearStartError).toHaveBeenCalledOnce();
  expect(startRecordingHandlerMock).toHaveBeenCalledWith({
    captureMode: CaptureMode.TAB,
    microphoneDevices: [],
    setIsStartPending: state.recording.setIsStartPending,
    setRecordingControlCapability: state.recording.setRecordingControlCapability,
    setStartError: state.recording.setStartError,
    videoSettings: state.recording.videoSettings,
    viewportPresetId: 'preset-1',
    webcamDevices: [],
  });
});

it.each([
  ['a pending start', VideoRecordingStatus.IDLE, true],
  ['an active recording', VideoRecordingStatus.RECORDING, false],
] as const)('does not start during %s', async (_label, status, isStartPending) => {
  const state = createState(status, isStartPending);
  await render(state);

  await act(async () => startRecording?.());

  expect(state.recording.clearStartError).not.toHaveBeenCalled();
  expect(startRecordingHandlerMock).not.toHaveBeenCalled();
});
