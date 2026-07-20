// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  captureModeSelectorMock: vi.fn(),
  postRecordPanelMock: vi.fn(),
  recordingPanelMock: vi.fn(),
  savingPanelMock: vi.fn(),
}));

vi.mock('./toggles/grid', () => ({
  VideoToggleGrid: () => <div />,
}));

vi.mock('../settings', () => ({
  VideoSettingsGrid: () => <div />,
}));

vi.mock('../footer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../footer')>()),
  VideoSetupWarnings: () => <div />,
}));

vi.mock('./options', () => ({
  CaptureModeSelector: (props: unknown) => {
    mocks.captureModeSelectorMock(props);
    return <div data-testid="capture-mode-selector" />;
  },
  VideoMicrophoneSelector: () => <div />,
  VideoPresetSelector: () => <div />,
  VideoWebcamSelector: () => <div />,
}));

vi.mock('./panel', () => ({
  VideoSetupRecordingPanel: (props: unknown) => {
    mocks.recordingPanelMock(props);
    return <div data-testid="recording-panel">recording</div>;
  },
}));

vi.mock('../post-record/panel', () => ({
  VideoPostRecordPanel: (props: unknown) => {
    mocks.postRecordPanelMock(props);
    return <div data-testid="post-record-panel">post-record</div>;
  },
}));

vi.mock('../post-record/saving', () => ({
  VideoSavingPanel: () => {
    mocks.savingPanelMock();
    return <div data-testid="saving-panel">saving</div>;
  },
}));

import { VideoSetupBody } from './body';
import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import {
  createActiveTabCapabilities,
  createBodySettings,
  createBodyViewModel,
  createSelectedPreset,
} from './body.test-support';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(): React.ComponentProps<typeof VideoSetupBody> {
  const selectedPreset = createSelectedPreset();
  return {
    activeTabCapabilities: createActiveTabCapabilities(),
    captureMode: CaptureMode.TAB,
    isLoadingMicrophones: false,
    isLoadingWebcams: false,
    microphoneDevices: [],
    onActiveRecordingSettingsChange: vi.fn(),
    onCaptureModeChange: vi.fn(),
    onMicrophoneDeviceChange: vi.fn(),
    onPresetChange: vi.fn(),
    onSettingsChange: vi.fn(),
    onToggleMicrophone: vi.fn(),
    onToggleWebcam: vi.fn(),
    onWebcamDeviceChange: vi.fn(),
    recordingState: {
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.IDLE,
      viewportPreset: null,
    },
    selectedPresetId: null,
    settings: createBodySettings(),
    startError: null,
    viewModel: createBodyViewModel(selectedPreset),
    viewportPresets: [selectedPreset],
    webcamDevices: [],
  };
}

async function renderBody(props: React.ComponentProps<typeof VideoSetupBody>) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);

  await act(async () => {
    root?.render(<VideoSetupBody {...props} />);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.captureModeSelectorMock.mockReset();
  mocks.postRecordPanelMock.mockReset();
  mocks.recordingPanelMock.mockReset();
  mocks.savingPanelMock.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

it('shows the saving panel while recording stop or discard is in progress', async () => {
  await renderBody({ ...createProps(), showSavingState: true });

  expect(container?.textContent).toContain('saving');
  expect(mocks.savingPanelMock).toHaveBeenCalled();
  expect(mocks.captureModeSelectorMock).not.toHaveBeenCalled();
});

it('shows post-record actions after a saved recording returns to idle', async () => {
  const onClosePostRecord = vi.fn();
  await renderBody({
    ...createProps(),
    onClosePostRecord,
    postRecordRecordingId: 'recording-1',
  });

  expect(container?.textContent).toContain('post-record');
  expect(mocks.postRecordPanelMock).toHaveBeenCalledWith({
    recordingId: 'recording-1',
    onClose: onClosePostRecord,
  });
  expect(mocks.captureModeSelectorMock).not.toHaveBeenCalled();
});

it('passes actual webcam settings into the active recording panel', async () => {
  await renderBody({
    ...createProps(),
    recordingState: {
      captureMode: CaptureMode.TAB,
      captureSource: null,
      countdownEndsAt: null,
      duration: 12,
      error: null,
      liveMedia: {
        microphoneDeviceId: null,
        microphoneEnabled: false,
        microphoneSelected: false,
        webcamDeviceId: 'cam-1',
        webcamEnabled: true,
        webcamSelected: true,
        webcamSettings: { frameRate: 30, height: 720, width: 1280 },
      },
      status: VideoRecordingStatus.RECORDING,
      viewportPreset: null,
    },
    webcamDevices: [{ deviceId: 'cam-1', label: 'Desk camera' }],
  });

  expect(mocks.recordingPanelMock).toHaveBeenCalledWith(
    expect.objectContaining({
      mediaSelection: expect.objectContaining({
        webcamLabel: 'Desk camera',
        webcamSettings: { frameRate: 30, height: 720, width: 1280 },
      }),
    })
  );
});
