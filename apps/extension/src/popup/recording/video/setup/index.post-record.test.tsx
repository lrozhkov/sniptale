// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bodyMock: vi.fn(),
  footerMock: vi.fn(),
  parsePopupRuntimeMessage: vi.fn(),
  runtimeInfoGetUrl: vi.fn(),
  subscribeToMessages: vi.fn(),
  sendRuntimeMessage: vi.fn(),
}));

vi.mock('../../../runtime-services', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime-services')>()),
  getPopupRuntimeServices: () => ({
    messaging: { sendRuntimeMessage: mocks.sendRuntimeMessage },
  }),
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

import VideoSetupPage from './index';
import {
  CaptureMode,
  VideoQuality,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { translate } from '../../../../platform/i18n';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.bodyMock.mockReset();
  mocks.footerMock.mockReset();
  mocks.parsePopupRuntimeMessage.mockReset();
  mocks.parsePopupRuntimeMessage.mockImplementation((message: unknown) => message);
  mocks.runtimeInfoGetUrl.mockReset();
  mocks.runtimeInfoGetUrl.mockImplementation((path: string) => `chrome-extension://test/${path}`);
  mocks.subscribeToMessages.mockReset();
  mocks.subscribeToMessages.mockReturnValue(() => undefined);
  mocks.sendRuntimeMessage.mockReset();
  mocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    postRecordResult: {
      primaryRecordingId: 'recording-1',
      projectId: null,
      recordingId: 'recording-1',
    },
  });
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
      ...DEFAULT_VIDEO_SETTINGS,
      autoFadeDelay: 0,
      countdownSeconds: 0,
      interactionDiagnosticsEnabled: false,
      microphoneDeviceId: null,
      microphoneEnabled: false,
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
    viewportPresetId: null,
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

async function stopAndRenderIdle(props: React.ComponentProps<typeof VideoSetupPage>) {
  await renderNode(<VideoSetupPage {...props} />);
  await act(async () => Promise.resolve());
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
  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      postRecordResult: expect.objectContaining({ recordingId: 'recording-1' }),
    })
  );
  expect(container?.querySelector('[data-testid="footer"]')).toBeNull();
});

it('restores post-record actions when recording ended outside the current popup controls', async () => {
  const props = createProps({
    activeRecordingId: 'recording-1',
    recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
  });

  await renderNode(<VideoSetupPage {...props} />);
  await renderNode(
    <VideoSetupPage
      {...props}
      activeRecordingId={null}
      recordingState={createRecordingState(VideoRecordingStatus.IDLE)}
    />
  );
  await act(async () => Promise.resolve());

  expect(props.onStop).not.toHaveBeenCalled();
  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      postRecordResult: expect.objectContaining({ recordingId: 'recording-1' }),
    })
  );
});

it('restores the durable result when runtime status is stale but no live recording is active', async () => {
  await renderNode(
    <VideoSetupPage
      {...createProps({
        activeRecordingId: null,
        recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
      })}
    />
  );
  await act(async () => Promise.resolve());

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'GET_RECORDING_STATE',
  });
  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      postRecordResult: expect.objectContaining({ recordingId: 'recording-1' }),
    })
  );
  expect(container?.querySelector('[data-testid="footer"]')).toBeNull();
});

it('never mounts recording controls while the durable result check is unresolved', async () => {
  let resolveRecordingState: ((value: { success: boolean }) => void) | null = null;
  mocks.sendRuntimeMessage.mockReturnValue(
    new Promise((resolve) => {
      resolveRecordingState = resolve;
    })
  );

  await renderNode(<VideoSetupPage {...createProps()} />);

  expect(container?.querySelector('[data-testid="footer"]')).toBeNull();
  expect(mocks.footerMock).not.toHaveBeenCalled();

  await act(async () => resolveRecordingState?.({ success: true }));

  expect(container?.querySelector('[data-testid="footer"]')).not.toBeNull();
});

it('recovers from a rejected durable result read through an explicit localized retry', async () => {
  const durableResult = {
    primaryRecordingId: 'recording-recovered',
    projectId: 'project-recovered',
    recordingId: 'recording-recovered',
  };
  mocks.sendRuntimeMessage
    .mockRejectedValueOnce(new Error('recording state unavailable'))
    .mockResolvedValueOnce({ success: true, postRecordResult: durableResult });

  await renderNode(<VideoSetupPage {...createProps()} />);
  await act(async () => Promise.resolve());

  expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
    translate('popup.video.postRecordLoadError')
  );
  expect(container?.querySelector('[data-testid="footer"]')).toBeNull();
  const retryButton = Array.from(container?.querySelectorAll('button') ?? []).find((button) =>
    button.textContent?.includes(translate('popup.video.postRecordRetry'))
  );
  expect(retryButton).toBeDefined();

  await act(async () => retryButton?.click());
  await act(async () => Promise.resolve());

  expect(mocks.sendRuntimeMessage).toHaveBeenCalledTimes(2);
  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordResult: durableResult })
  );
  expect(container?.querySelector('[role="alert"]')).toBeNull();
  expect(container?.querySelector('[data-testid="footer"]')).toBeNull();
});

it('keeps durable post-record authority blocking until ACK succeeds', async () => {
  vi.useFakeTimers();

  await stopAndRenderIdle(
    createProps({
      activeRecordingId: 'recording-1',
      recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
    })
  );
  await act(async () => vi.runAllTimersAsync());

  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      postRecordResult: expect.objectContaining({ recordingId: 'recording-1' }),
    })
  );
  expect(container?.querySelector('[data-testid="footer"]')).toBeNull();
});

it('replaces stale local post-record state with the durable latest result after ACK', async () => {
  const resultA = {
    primaryRecordingId: 'recording-1',
    projectId: null,
    recordingId: 'recording-1',
  };
  const resultB = {
    primaryRecordingId: 'recording-2',
    projectId: null,
    recordingId: 'recording-2',
  };
  mocks.sendRuntimeMessage
    .mockResolvedValueOnce({ success: true, postRecordResult: resultA })
    .mockResolvedValueOnce({ success: true, result: 'stale' })
    .mockResolvedValueOnce({ success: true, postRecordResult: resultB });
  await renderNode(<VideoSetupPage {...createProps()} />);
  await act(async () => Promise.resolve());
  const bodyProps = mocks.bodyMock.mock.calls.at(-1)?.[0] as {
    onAcknowledgePostRecord: () => Promise<void>;
  };
  await act(async () => bodyProps.onAcknowledgePostRecord());

  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({ postRecordResult: resultB })
  );
});
