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
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
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
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function createProps() {
  return {
    activeRecordingId: 'recording-1',
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
    recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
    selectedPresetId: null,
    settings: createSettings(),
    startError: null,
    viewportPresets: [],
    webcamDevices: [],
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

function createSettings() {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 0,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: false,
    quality: VideoQuality.MEDIUM,
    systemAudioEnabled: true,
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

function createSavedRecording(id: string) {
  return {
    blob: new Blob([id], { type: 'video/webm' }),
    createdAt: 1,
    filename: `${id}.webm`,
    id,
    size: 12,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

async function renderPage(props = createProps()) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<VideoSetupPage {...props} />));
}

async function rerenderIdleFor(recordingId: string) {
  await act(async () =>
    root?.render(
      <VideoSetupPage
        {...createProps()}
        activeRecordingId={recordingId}
        recordingState={createRecordingState(VideoRecordingStatus.RECORDING)}
      />
    )
  );
  await stopRecordingFromFooter();
}

function subscribeHarness() {
  let listener: ((message: unknown, sender?: chrome.runtime.MessageSender) => void) | null = null;
  mocks.subscribeToMessages.mockImplementation((nextListener) => {
    listener = nextListener;
    return () => undefined;
  });
  return {
    emit: async (recordingId: string, sender = createOffscreenSender()) => {
      await act(async () => {
        listener?.({ type: VideoMessageType.VIDEO_SAVED_TO_IDB, recordingId }, sender);
        await Promise.resolve();
      });
    },
  };
}

function createOffscreenSender(): chrome.runtime.MessageSender {
  return { url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html' };
}

async function stopRecordingFromFooter() {
  const footerProps = mocks.footerMock.mock.calls.at(-1)?.[0] as { onStop: () => void };
  await act(async () => footerProps.onStop());
}

it('opens post-record actions from a trusted saved-recording lifecycle event', async () => {
  const harness = subscribeHarness();
  await renderPage();
  await stopRecordingFromFooter();

  await harness.emit('recording-1');

  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordRecordingId: 'recording-1' })
  );
});

it('ignores saved-recording lifecycle events for unrelated ids and untrusted senders', async () => {
  const harness = subscribeHarness();
  mocks.getRecording.mockResolvedValue(undefined);
  await renderPage();
  await stopRecordingFromFooter();

  await harness.emit('recording-2');
  await harness.emit('recording-1', { url: 'https://example.test/content.js' });
  await harness.emit('recording-1', {
    url: 'chrome-extension://test/apps/extension/src/offscreen/offscreen.html.evil',
  });
  await harness.emit('recording-1', { url: 'not a url' });
  await harness.emit('recording-1', {});

  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordRecordingId: null })
  );
});

it('does not show post-record actions before IndexedDB availability', async () => {
  const harness = subscribeHarness();
  mocks.getRecording.mockResolvedValue(undefined);
  await renderPage();
  await stopRecordingFromFooter();

  await harness.emit('recording-1');

  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordRecordingId: null })
  );
});

it('ignores stale saved events that resolve after a newer post-record intent', async () => {
  const harness = subscribeHarness();
  const oldRecording = createDeferred<ReturnType<typeof createSavedRecording>>();
  mocks.getRecording.mockReturnValueOnce(oldRecording.promise);
  await renderPage();
  await stopRecordingFromFooter();

  void harness.emit('recording-1');
  await rerenderIdleFor('recording-2');
  oldRecording.resolve(createSavedRecording('recording-1'));
  await act(async () => Promise.resolve());

  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordRecordingId: null })
  );
});
