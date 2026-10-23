// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  displayMock: vi.fn(),
  errorMock: vi.fn(),
  headerMock: vi.fn(),
  viewModelMock: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../runtime-services', () => ({
  getPopupRuntimeServices: () => ({ messaging: { sendRuntimeMessage: mocks.sendRuntimeMessage } }),
}));

vi.mock('../../../../platform/i18n/popup', () => ({ translate: (key: string) => key }));

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
  mocks.sendRuntimeMessage.mockReset();
  mocks.sendRuntimeMessage.mockResolvedValue({ success: false });
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
    viewportPresetId: null,
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

function countdownProps(): ComponentProps<typeof VideoSetupRecordingPanel> {
  return {
    recordingState: {
      captureMode: CaptureMode.TAB,
      captureSource: null,
      countdownEndsAt: 10000,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.COUNTDOWN,
      viewportPresetId: null,
      microphoneActivity: { status: 'ready', level: 0.4, warning: false },
    },
    mediaSelection: {
      microphoneDeviceId: 'mic-1',
      microphoneEnabled: true,
      microphoneSelected: true,
      microphoneLabel: 'Internal mic',
      webcamDeviceId: null,
      webcamEnabled: false,
      webcamSelected: false,
      webcamSettings: null,
      webcamLabel: null,
    },
    onActiveRecordingSettingsChange: vi.fn().mockResolvedValue(undefined),
  };
}

it('shows microphone readiness with read-only controls before the start response', async () => {
  const props = countdownProps();
  await act(async () => renderNode(<VideoSetupRecordingPanel {...props} />));

  expect(container?.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')).toBe('87');
  expect(container?.textContent).toContain('popup.video.countdownMediaReadOnly');
  expect(container?.textContent).toContain('Internal mic');
  const microphoneButton = container?.querySelector<HTMLButtonElement>(
    '[aria-label="popup.video.activeMicrophoneMute"]'
  );
  expect(microphoneButton?.disabled).toBe(true);
  await act(async () => microphoneButton?.click());
  expect(props.onActiveRecordingSettingsChange).not.toHaveBeenCalled();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();

  await act(async () =>
    renderNode(
      <VideoSetupRecordingPanel
        {...props}
        recordingState={{ ...props.recordingState, status: VideoRecordingStatus.RECORDING }}
      />
    )
  );
  expect(container?.querySelector('[role="meter"]')).toBeNull();
  expect(container?.textContent).not.toContain('popup.video.countdownMediaReadOnly');
  const activeMicrophoneButton = container?.querySelector<HTMLButtonElement>(
    '[aria-label="popup.video.activeMicrophoneMute"]'
  );
  expect(activeMicrophoneButton?.disabled).toBe(false);
  await act(async () => activeMicrophoneButton?.click());
  expect(props.onActiveRecordingSettingsChange).toHaveBeenCalledExactlyOnceWith({
    microphoneEnabled: false,
  });
});

it('shows camera readiness without a microphone and rejects another recording capability', async () => {
  const props = countdownProps();
  mocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    controlToken: 'other-token',
    recordingId: 'other-recording',
    state: props.recordingState,
  });
  await act(async () =>
    renderNode(
      <VideoSetupRecordingPanel
        {...props}
        activeRecordingId="current-recording"
        mediaSelection={{
          ...props.mediaSelection,
          microphoneEnabled: false,
          microphoneSelected: false,
          webcamDeviceId: 'cam-1',
          webcamEnabled: true,
          webcamSelected: true,
          webcamLabel: 'Desk camera',
        }}
      />
    )
  );

  expect(
    container?.querySelector('[data-ui="popup.video-active.countdown-camera-preview"]')
  ).not.toBeNull();
  expect(container?.querySelector('[role="meter"]')).toBeNull();
  expect(container?.textContent).toContain('popup.video.countdownCameraUnavailable');
  expect(container?.textContent).toContain('Desk camera');
  expect(container?.textContent).toContain('popup.video.countdownMediaReadOnly');
  expect(mocks.sendRuntimeMessage).toHaveBeenCalledExactlyOnceWith({ type: 'GET_RECORDING_STATE' });
  const webcamButton = container?.querySelector<HTMLButtonElement>(
    '[aria-label="popup.video.activeWebcamMute"]'
  );
  expect(webcamButton?.disabled).toBe(true);
  await act(async () => webcamButton?.click());
  expect(props.onActiveRecordingSettingsChange).not.toHaveBeenCalled();
});

it('keeps countdown guidance without starting readiness consumers when both devices are disabled', async () => {
  const props = countdownProps();
  await act(async () =>
    renderNode(
      <VideoSetupRecordingPanel
        {...props}
        mediaSelection={{
          ...props.mediaSelection,
          microphoneEnabled: false,
          microphoneSelected: false,
        }}
      />
    )
  );
  expect(container?.querySelector('[role="meter"]')).toBeNull();
  expect(
    container?.querySelector('[data-ui="popup.video-active.countdown-camera-preview"]')
  ).toBeNull();
  expect(container?.textContent).toContain('popup.video.countdownMediaReadOnly');
  expect(container?.querySelector('button')).toBeNull();
  expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled();
});
