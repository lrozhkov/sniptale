// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bodyMock: vi.fn(),
  footerMock: vi.fn(),
  getRecording: vi.fn(),
  parsePopupRuntimeMessage: vi.fn(),
  runtimeInfoGetUrl: vi.fn(),
  subscribeToMessages: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: { subscribeToMessages: mocks.subscribeToMessages },
  runtimeInfo: { getURL: mocks.runtimeInfoGetUrl },
}));

vi.mock('../../../../contracts/messaging/parsers/boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../contracts/messaging/parsers/boundary')>()),
  parsePopupRuntimeMessage: mocks.parsePopupRuntimeMessage,
}));

vi.mock('./body', () => ({
  VideoSetupBody: (props: unknown) => {
    mocks.bodyMock(props);
    return <div data-testid="video-setup-body" />;
  },
}));

vi.mock('../footer', () => ({
  VideoActiveFooterControls: () => <div data-testid="active-footer-controls" />,
  VideoSetupFooter: (props: unknown) => {
    mocks.footerMock(props);
    return <div data-testid="footer" />;
  },
  VideoSetupWarnings: () => <div data-testid="video-setup-warnings" />,
}));

vi.mock('../../../../composition/persistence/recordings/index', () => ({
  cleanupOldRecordings: vi.fn(),
  deleteRecording: vi.fn(),
  getRecording: mocks.getRecording,
  listRecordings: vi.fn(),
  saveRecording: vi.fn(),
}));

import VideoSetupPage from './index';
import {
  CaptureMode,
  VideoQuality,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.bodyMock.mockReset();
  mocks.footerMock.mockReset();
  mocks.getRecording.mockReset();
  mocks.getRecording.mockResolvedValue(createSavedRecording('recording-1'));
  mocks.parsePopupRuntimeMessage.mockReset();
  mocks.parsePopupRuntimeMessage.mockImplementation((message: unknown) => message);
  mocks.runtimeInfoGetUrl.mockReset();
  mocks.runtimeInfoGetUrl.mockImplementation((path: string) => `chrome-extension://test/${path}`);
  mocks.subscribeToMessages.mockReset();
  mocks.subscribeToMessages.mockReturnValue(() => undefined);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function createProps(overrides: Partial<React.ComponentProps<typeof VideoSetupPage>> = {}) {
  return {
    activeRecordingId: null,
    activeTabCapabilities: createActiveTabCapabilities(),
    appliedViewportPresetId: null,
    appliedViewportTabId: null,
    captureMode: CaptureMode.TAB,
    galleryStatus: null,
    isLoadingMicrophones: false,
    isLoadingWebcams: false,
    isStartPending: false,
    microphoneDevices: [],
    onActiveRecordingSettingsChange: vi.fn(),
    onCancel: vi.fn(),
    onCaptureModeChange: vi.fn(),
    onMicrophoneDeviceChange: vi.fn(),
    onPauseResume: vi.fn(),
    onPresetChange: vi.fn(),
    onSettingsChange: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    onToggleMicrophone: vi.fn(),
    onToggleWebcam: vi.fn(),
    onWebcamDeviceChange: vi.fn(),
    recordingState: createRecordingState(VideoRecordingStatus.IDLE),
    selectedPresetId: null,
    settings: {
      autoFadeDelay: 0,
      countdownSeconds: 0,
      diagnosticsEnabled: false,
      microphoneDeviceId: null,
      microphoneEnabled: false,
      openEditorAfterRecording: false,
      quality: VideoQuality.MEDIUM,
      systemAudioEnabled: true,
    },
    startError: null,
    viewportPresets: [],
    webcamDevices: [],
    ...overrides,
  };
}

function createActiveTabCapabilities(): ActiveTabCapabilities {
  return {
    export: { supported: true, reason: null },
    isRestrictedPage: false,
    quickActions: { supported: true, reason: null },
    restrictedPageLabel: null,
    screenshotMode: { supported: true, reason: null },
    tabId: 1,
    title: 'Example',
    url: 'https://example.test',
    videoByMode: {
      [CaptureMode.SCREEN]: { supported: true, reason: null },
      [CaptureMode.TAB]: { supported: true, reason: null },
      [CaptureMode.TAB_CROP]: { supported: true, reason: null },
      [CaptureMode.CAMERA]: { supported: true, reason: null },
      [CaptureMode.VIEWPORT_EMULATION]: { supported: true, reason: null },
    },
  };
}

function createRecordingState(status: VideoRecordingStatus) {
  return {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: status === VideoRecordingStatus.IDLE ? 0 : 8,
    error: null,
    status,
    viewportPreset: null,
  };
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => root?.render(node));
}

function createSavedRecording(id: string) {
  return {
    blob: new Blob([id], { type: 'video/webm' }),
    createdAt: 1,
    filename: `${id}.webm`,
    id,
    size: 12,
  };
}

async function stopAndRenderIdle(props: React.ComponentProps<typeof VideoSetupPage>) {
  await renderNode(<VideoSetupPage {...props} />);
  const footerProps = mocks.footerMock.mock.calls.at(-1)?.[0] as { onStop: () => void };
  await act(async () => footerProps.onStop());
  await renderNode(
    <VideoSetupPage
      {...props}
      activeRecordingId={null}
      recordingState={createRecordingState(VideoRecordingStatus.IDLE)}
    />
  );
}

it('keeps the saved recording id for post-record actions after verified save', async () => {
  const onStop = vi.fn();
  const props = createProps({
    activeRecordingId: 'recording-1',
    onStop,
    recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
  });

  await stopAndRenderIdle(props);
  await act(async () => Promise.resolve());

  expect(onStop).toHaveBeenCalled();
  expect(mocks.getRecording).toHaveBeenCalledWith('recording-1');
  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordRecordingId: 'recording-1' })
  );
});

it('does not expose post-record actions when the saved recording is unavailable', async () => {
  vi.useFakeTimers();
  mocks.getRecording.mockResolvedValue(undefined);

  await stopAndRenderIdle(
    createProps({
      activeRecordingId: 'recording-1',
      recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
    })
  );
  await act(async () => vi.runAllTimersAsync());

  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordRecordingId: null })
  );
});
