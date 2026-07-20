// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const videoSetupBodyMocks = vi.hoisted(() => ({
  captureModeSelectorMock: vi.fn(),
  microphoneSelectorMock: vi.fn(),
  webcamSelectorMock: vi.fn(),
  recordingPanelMock: vi.fn(),
  presetSelectorMock: vi.fn(),
  settingsGridMock: vi.fn(),
  toggleGridMock: vi.fn(),
  warningsMock: vi.fn(),
}));

vi.mock('./toggles/grid', (_importOriginal) => ({
  VideoToggleGrid: (props: unknown) => {
    videoSetupBodyMocks.toggleGridMock(props);
    return <div data-testid="toggle-grid">toggles</div>;
  },
}));

vi.mock('../settings', (_importOriginal) => ({
  VideoSettingsGrid: (props: unknown) => {
    videoSetupBodyMocks.settingsGridMock(props);
    return <div data-testid="settings-surface">settings</div>;
  },
}));

vi.mock('../footer', (_importOriginal) => ({
  VideoSetupWarnings: (props: unknown) => {
    videoSetupBodyMocks.warningsMock(props);
    return <div data-testid="warnings">warnings</div>;
  },
}));

vi.mock('./panel', (_importOriginal) => ({
  VideoSetupRecordingPanel: (props: unknown) => {
    videoSetupBodyMocks.recordingPanelMock(props);
    return <div data-testid="recording-panel">recording</div>;
  },
}));

vi.mock('./options', (_importOriginal) => ({
  CaptureModeSelector: (props: unknown) => {
    videoSetupBodyMocks.captureModeSelectorMock(props);
    return <div data-testid="capture-mode-selector">capture-mode</div>;
  },
  VideoMicrophoneSelector: (props: unknown) => {
    videoSetupBodyMocks.microphoneSelectorMock(props);
    return <div data-testid="microphone-selector">microphone</div>;
  },
  VideoWebcamSelector: (props: unknown) => {
    videoSetupBodyMocks.webcamSelectorMock(props);
    return <div data-testid="webcam-selector">webcam</div>;
  },
  VideoPresetSelector: (props: unknown) => {
    videoSetupBodyMocks.presetSelectorMock(props);
    return <div data-testid="preset-selector">preset</div>;
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

function createBodyProps(): React.ComponentProps<typeof VideoSetupBody> {
  const selectedPreset = createSelectedPreset();

  return {
    activeTabCapabilities: createActiveTabCapabilities(),
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    isLoadingMicrophones: false,
    isLoadingWebcams: false,
    microphoneDevices: [{ deviceId: 'mic-1', label: 'USB Mic' }],
    webcamDevices: [{ deviceId: 'cam-1', label: 'USB Camera' }],
    onCaptureModeChange: vi.fn(),
    onMicrophoneDeviceChange: vi.fn(),
    onWebcamDeviceChange: vi.fn(),
    onPresetChange: vi.fn(),
    onActiveRecordingSettingsChange: vi.fn(),
    onSettingsChange: vi.fn(),
    onToggleMicrophone: vi.fn(),
    onToggleWebcam: vi.fn(),
    recordingState: {
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.IDLE,
      viewportPreset: null,
    },
    selectedPresetId: 'preset-1',
    settings: createBodySettings(),
    startError: 'boom',
    viewModel: createBodyViewModel(selectedPreset),
    viewportPresets: [selectedPreset],
  };
}

function expectTestIdBefore(firstTestId: string, secondTestId: string) {
  const first = container?.querySelector(`[data-testid="${firstTestId}"]`);
  const second = container?.querySelector(`[data-testid="${secondTestId}"]`);

  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(first?.compareDocumentPosition(second as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
}

async function renderBody() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = createBodyProps();

  await act(async () => {
    root?.render(<VideoSetupBody {...props} />);
  });

  return props;
}

async function renderRecordingBody() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const props = createBodyProps();
  props.recordingState = {
    ...props.recordingState,
    duration: 8,
    status: VideoRecordingStatus.RECORDING,
  };

  await act(async () => {
    root?.render(<VideoSetupBody {...props} />);
  });

  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  videoSetupBodyMocks.captureModeSelectorMock.mockReset();
  videoSetupBodyMocks.microphoneSelectorMock.mockReset();
  videoSetupBodyMocks.webcamSelectorMock.mockReset();
  videoSetupBodyMocks.presetSelectorMock.mockReset();
  videoSetupBodyMocks.recordingPanelMock.mockReset();
  videoSetupBodyMocks.settingsGridMock.mockReset();
  videoSetupBodyMocks.toggleGridMock.mockReset();
  videoSetupBodyMocks.warningsMock.mockReset();
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

function expectSetupSectionOrder() {
  expect(container?.textContent).toContain('capture-mode');
  expect(container?.textContent).toContain('preset');
  expect(container?.textContent).toContain('toggles');
  expect(container?.textContent).toContain('settings');
  expectTestIdBefore('capture-mode-selector', 'toggle-grid');
  expectTestIdBefore('toggle-grid', 'microphone-selector');
  expectTestIdBefore('microphone-selector', 'webcam-selector');
  expectTestIdBefore('webcam-selector', 'preset-selector');
  expectTestIdBefore('preset-selector', 'settings-surface');
}

function expectSelectorProps(props: React.ComponentProps<typeof VideoSetupBody>) {
  expect(videoSetupBodyMocks.captureModeSelectorMock).toHaveBeenCalledWith(
    expect.objectContaining({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
    })
  );
  expect(videoSetupBodyMocks.presetSelectorMock).toHaveBeenCalledWith(
    expect.objectContaining({
      selectedPresetId: 'preset-1',
      viewportPresets: props.viewportPresets,
    })
  );
}

function expectSetupControlProps(props: React.ComponentProps<typeof VideoSetupBody>) {
  expect(videoSetupBodyMocks.toggleGridMock).toHaveBeenCalledWith(
    expect.objectContaining({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      controlledCursorDisabled: true,
      controlledCursorDisabledReason: 'Desktop app required',
      diagnosticsDisabled: false,
      systemAudioDisabled: true,
    })
  );
  expect(videoSetupBodyMocks.microphoneSelectorMock).toHaveBeenCalledWith(
    expect.objectContaining({
      microphoneDevices: props.microphoneDevices,
      onSettingsChange: props.onSettingsChange,
      settings: props.settings,
    })
  );
  expect(videoSetupBodyMocks.webcamSelectorMock).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: props.settings,
      webcamDevices: props.webcamDevices,
    })
  );
  expect(videoSetupBodyMocks.settingsGridMock).toHaveBeenCalledWith(
    expect.objectContaining({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      onSettingsChange: props.onSettingsChange,
      settings: props.settings,
    })
  );
  expect(videoSetupBodyMocks.warningsMock).toHaveBeenCalledWith(
    expect.objectContaining({
      startError: 'boom',
    })
  );
}

function expectSetupOnlySections() {
  expect(videoSetupBodyMocks.recordingPanelMock).not.toHaveBeenCalled();
}

it('composes capture, preset, toggle, settings, and warning sections from the video setup view model', async () => {
  const props = await renderBody();

  expectSetupSectionOrder();
  expectSelectorProps(props);
  expectSetupControlProps(props);
  expectSetupOnlySections();
});

it('locks webcam and hides screen preset controls in camera mode', async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const props = createBodyProps();
  props.captureMode = CaptureMode.CAMERA;

  await act(async () => {
    root?.render(<VideoSetupBody {...props} />);
  });

  expect(videoSetupBodyMocks.presetSelectorMock).toHaveBeenCalledWith(
    expect.objectContaining({ hidden: true })
  );
  expect(videoSetupBodyMocks.toggleGridMock).toHaveBeenCalledWith(
    expect.objectContaining({ captureMode: CaptureMode.CAMERA, webcamLocked: true })
  );
});

it('replaces setup sections with the recording panel while video capture is active', async () => {
  const props = await renderRecordingBody();

  expect(container?.textContent).toContain('recording');
  expect(videoSetupBodyMocks.recordingPanelMock).toHaveBeenCalledWith(
    expect.objectContaining({
      recordingState: props.recordingState,
    })
  );
  expect(videoSetupBodyMocks.captureModeSelectorMock).not.toHaveBeenCalled();
  expect(videoSetupBodyMocks.presetSelectorMock).not.toHaveBeenCalled();
  expect(videoSetupBodyMocks.microphoneSelectorMock).not.toHaveBeenCalled();
  expect(videoSetupBodyMocks.webcamSelectorMock).not.toHaveBeenCalled();
  expect(videoSetupBodyMocks.settingsGridMock).not.toHaveBeenCalled();
  expect(videoSetupBodyMocks.warningsMock).not.toHaveBeenCalled();
});
