// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  displayMock: vi.fn(),
  errorMock: vi.fn(),
  headerMock: vi.fn(),
  viewModelMock: vi.fn(),
}));

vi.mock('../active-page/view-model', () => ({
  getVideoActiveViewModel: vi.fn(),
  useVideoActiveViewModel: mocks.viewModelMock,
}));

vi.mock('../active-page/surface', () => ({
  ACTIVE_PANEL_CLASS_NAME: 'active-panel',
  VideoActiveControls: () => <div data-testid="recording-controls" />,
  VideoActiveDisplay: (props: unknown) => {
    mocks.displayMock(props);
    return <div data-testid="recording-display" />;
  },
  VideoActiveError: (props: unknown) => {
    mocks.errorMock(props);
    return <div data-testid="recording-error" />;
  },
  VideoActiveStatusHeader: (props: unknown) => {
    mocks.headerMock(props);
    return <div data-testid="recording-header" />;
  },
}));

import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoSetupRecordingPanel } from './panel';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.displayMock.mockReset();
  mocks.errorMock.mockReset();
  mocks.headerMock.mockReset();
  mocks.viewModelMock.mockReset();
  mocks.viewModelMock.mockReturnValue({
    canControl: true,
    isBusy: false,
    isPaused: false,
    modeLabel: 'Tab',
    sourceLabel: 'Current tab',
    value: '00:08',
    viewportPresetLabel: 'Preset 1280x720',
  });
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

it('renders the active recording status, value, and error through the active-page views', () => {
  const recordingState = {
    captureMode: CaptureMode.TAB,
    captureSource: null,
    countdownEndsAt: null,
    duration: 8,
    error: 'Failed to sync',
    status: VideoRecordingStatus.RECORDING,
    viewportPreset: null,
  };

  renderNode(
    <VideoSetupRecordingPanel
      recordingState={recordingState}
      mediaSelection={{
        microphoneDeviceId: 'mic-1',
        microphoneEnabled: true,
        microphoneSelected: true,
        microphoneLabel: 'Internal mic',
        webcamDeviceId: null,
        webcamEnabled: false,
        webcamSelected: false,
        webcamSettings: null,
        webcamLabel: null,
      }}
      onActiveRecordingSettingsChange={vi.fn()}
    />
  );

  expect(mocks.viewModelMock).toHaveBeenCalledWith(recordingState);
  expect(mocks.headerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      modeLabel: 'Tab',
      recordingState,
    })
  );
  expect(mocks.displayMock).toHaveBeenCalledWith(
    expect.objectContaining({
      recordingState,
      sourceLabel: 'Current tab',
      value: '00:08',
      viewportPresetLabel: 'Preset 1280x720',
    })
  );
  expect(mocks.errorMock).toHaveBeenCalledWith(
    expect.objectContaining({
      error: 'Failed to sync',
    })
  );
});
