// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bodyMock: vi.fn(),
  footerMock: vi.fn(),
  subscribeToMessages: vi.fn(),
}));

vi.mock('../../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => `t:${key}`,
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: { subscribeToMessages: mocks.subscribeToMessages },
}));

vi.mock('./body', (_importOriginal) => ({
  VideoSetupBody: (props: unknown) => {
    mocks.bodyMock(props);
    return <div data-testid="video-setup-body" />;
  },
}));

vi.mock('../footer', (_importOriginal) => ({
  VideoSetupFooter: (props: unknown) => {
    mocks.footerMock(props);
    return <div data-testid="footer" />;
  },
}));

import VideoSetupPage from './index';
import type { ActiveTabCapabilities } from '@sniptale/runtime-contracts/tab-capabilities/types';
import {
  CaptureMode,
  VideoQuality,
  type VideoRecordingRuntimeState,
  type VideoRecordingSettings,
  VideoRecordingStatus,
} from '@sniptale/runtime-contracts/video/types/types';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createActiveTabCapabilities(
  overrides: Partial<ActiveTabCapabilities> = {}
): ActiveTabCapabilities {
  return {
    tabId: 1,
    url: 'https://example.com',
    title: 'Example',
    isRestrictedPage: false,
    restrictedPageLabel: null,
    screenshotMode: { supported: true, reason: null },
    quickActions: { supported: true, reason: null },
    export: { supported: true, reason: null },
    videoByMode: {
      [CaptureMode.TAB]: { supported: true, reason: null },
      [CaptureMode.TAB_CROP]: { supported: true, reason: null },
      [CaptureMode.CAMERA]: { supported: true, reason: null },
      [CaptureMode.VIEWPORT_EMULATION]: { supported: true, reason: null },
      [CaptureMode.SCREEN]: { supported: true, reason: null },
    },
    ...overrides,
  };
}

function createProps(
  overrides: Partial<React.ComponentProps<typeof VideoSetupPage>> = {}
): React.ComponentProps<typeof VideoSetupPage> {
  return {
    settings: createVideoSettings(),
    captureMode: CaptureMode.TAB,
    selectedPresetId: 'preset-1',
    appliedViewportPresetId: 'preset-1',
    appliedViewportTabId: 1,
    viewportPresets: [{ id: 'preset-1', label: 'Preset', width: 1280, height: 720 }],
    activeTabCapabilities: createActiveTabCapabilities(),
    microphoneDevices: [],
    isLoadingMicrophones: false,
    webcamDevices: [],
    isLoadingWebcams: false,
    startError: null,
    isStartPending: false,
    galleryStatus: { text: '3 projects', pressure: 'healthy' as const },
    activeRecordingId: null,
    recordingState: createRecordingState(),
    onCaptureModeChange: vi.fn(),
    onCancel: vi.fn(),
    onPresetChange: vi.fn(),
    onMicrophoneDeviceChange: vi.fn(),
    onWebcamDeviceChange: vi.fn(),
    onPauseResume: vi.fn(),
    onToggleMicrophone: vi.fn(),
    onToggleWebcam: vi.fn(),
    onActiveRecordingSettingsChange: vi.fn(),
    onSettingsChange: vi.fn(),
    onStart: vi.fn(),
    onStop: vi.fn(),
    ...overrides,
  };
}

function createVideoSettings(): VideoRecordingSettings {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: true,
    microphoneDeviceId: null,
    microphoneEnabled: true,
    openEditorAfterRecording: true,
    quality: VideoQuality.MEDIUM,
    systemAudioEnabled: true,
  };
}

function createRecordingState(): VideoRecordingRuntimeState {
  return {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 0,
    error: null,
    status: VideoRecordingStatus.IDLE,
    viewportPreset: null,
  };
}

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.bodyMock.mockReset();
  mocks.footerMock.mockReset();
  mocks.subscribeToMessages.mockReset();
  mocks.subscribeToMessages.mockReturnValue(() => undefined);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function verifiesStartableViewModel() {
  const props = createProps();

  await renderNode(<VideoSetupPage {...props} />);

  expect(mocks.bodyMock).toHaveBeenCalledWith(
    expect.objectContaining({
      viewModel: expect.objectContaining({
        canStart: true,
        controlledCursorDisabled: false,
        controlledCursorDisabledReason: null,
        galleryTitle: 't:popup.video.galleryTitle. 3 projects',
        selectedPreset: expect.objectContaining({ id: 'preset-1' }),
        startButtonLabel: 't:popup.video.startButton',
      }),
    })
  );
  expect(mocks.footerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      canStart: true,
      galleryTitle: 't:popup.video.galleryTitle. 3 projects',
      startButtonLabel: 't:popup.video.startButton',
    })
  );
}

async function verifiesDisabledStartState() {
  await renderNode(
    <VideoSetupPage
      {...createProps({
        isStartPending: true,
        selectedPresetId: null,
        viewportPresets: [],
        galleryStatus: null,
        activeTabCapabilities: createActiveTabCapabilities({
          videoByMode: {
            ...createActiveTabCapabilities().videoByMode,
            [CaptureMode.TAB_CROP]: { supported: true, reason: null },
            [CaptureMode.TAB]: { supported: false, reason: 'blocked' },
            [CaptureMode.SCREEN]: { supported: true, reason: null },
          },
        }),
      })}
    />
  );

  expect(mocks.footerMock).toHaveBeenCalledWith(
    expect.objectContaining({
      canStart: false,
      galleryTitle: 't:popup.video.galleryTitle',
      startButtonLabel: 't:popup.video.startPending',
      startDisabledReason: 'blocked',
    })
  );
}

it(
  'builds a startable view model with independent viewport preset selection',
  verifiesStartableViewModel
);
it('disables start when the current mode is unavailable or pending', verifiesDisabledStartState);

it('shows saving state and clears the visible timer while discarding an active recording', async () => {
  const onCancel = vi.fn();
  await renderNode(
    <VideoSetupPage
      {...createProps({
        activeRecordingId: 'recording-1',
        onCancel,
        recordingState: {
          ...createRecordingState(),
          duration: 23,
          status: VideoRecordingStatus.RECORDING,
        },
      })}
    />
  );

  const footerProps = mocks.footerMock.mock.calls.at(-1)?.[0] as {
    onCancel: () => void;
  };

  await act(async () => {
    footerProps.onCancel();
  });

  expect(onCancel).toHaveBeenCalled();
  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      showSavingState: true,
      recordingState: expect.objectContaining({
        duration: 0,
        status: VideoRecordingStatus.IDLE,
      }),
    })
  );
});

it('returns to setup immediately when cancelling before recorder activation', async () => {
  const onCancel = vi.fn();
  await renderNode(
    <VideoSetupPage
      {...createProps({
        isStartPending: true,
        onCancel,
        recordingState: {
          ...createRecordingState(),
          countdownEndsAt: Date.now() + 3000,
          status: VideoRecordingStatus.COUNTDOWN,
        },
      })}
    />
  );

  const footerProps = mocks.footerMock.mock.calls.at(-1)?.[0] as {
    onCancel: () => void;
  };

  await act(async () => {
    footerProps.onCancel();
  });

  expect(onCancel).toHaveBeenCalled();
  expect(mocks.bodyMock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      isStartPending: false,
      showSavingState: false,
      recordingState: expect.objectContaining({
        countdownEndsAt: null,
        status: VideoRecordingStatus.IDLE,
      }),
    })
  );
});
