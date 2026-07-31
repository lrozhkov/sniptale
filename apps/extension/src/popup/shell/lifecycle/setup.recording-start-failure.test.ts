// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  recordingHandlers: undefined as
    | {
        onRecordingStartFailed: (error?: string | null) => void;
        onRecordingState: (state: { status: string }) => void;
      }
    | undefined,
  subscribeToActivatedMock: vi.fn(() => vi.fn()),
  subscribeToMediaHubEventsMock: vi.fn(() => vi.fn()),
  subscribeToRecordingMessagesMock: vi.fn(),
  subscribeToUpdatedMock: vi.fn(() => vi.fn()),
  translateMock: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock('@sniptale/platform/browser/tabs', (_importOriginal) => ({
  browserTabs: {
    subscribeToActivated: mocks.subscribeToActivatedMock,
    subscribeToUpdated: mocks.subscribeToUpdatedMock,
  },
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: mocks.translateMock,
}));

vi.mock('../../../features/media-hub/events', (_importOriginal) => ({
  subscribeToMediaHubEvents: mocks.subscribeToMediaHubEventsMock,
}));

vi.mock('../bootstrap', (_importOriginal) => ({
  bootstrapPopupState: vi.fn(async () => ({
    captureMode: 'visible',
    microphones: [],
    quickActions: [],
    quickActionsMode: 'grid',
    recordingControlCapability: null,
    recordingState: { status: 'idle' },
    selectedPresetId: null,
    videoSettings: {},
    viewportPresets: [],
    webcams: [],
  })),
}));

vi.mock('../message-sync', (_importOriginal) => ({
  subscribeToRecordingMessages: mocks.subscribeToRecordingMessagesMock,
}));

vi.mock('../export/runtime/tab-message-routing', (_importOriginal) => ({
  consumePopupExportLaunchIntentForActiveTab: vi.fn(async () => null),
}));

import { setupPopupLifecycle } from './setup';
import type { PopupLifecycleParams } from './contracts';

function createParams(): PopupLifecycleParams {
  const refreshActiveTabCapabilities = vi.fn(async () => undefined);
  const refreshGalleryStatus = vi.fn(async () => undefined);
  const setRecordingState = vi.fn();
  const setStartError = vi.fn();

  return {
    bootstrap: {
      refreshActiveTabCapabilities,
      refreshGalleryStatus,
      setDisplayMode: vi.fn(),
      setHomeError: vi.fn(),
      setPage: vi.fn(),
      setIsReady: vi.fn(),
      setMicrophoneDevices: vi.fn(),
      setQuickActions: vi.fn(),
      setQuickActionsReady: vi.fn(),
      setRecordingControlCapability: vi.fn(),
      setRecordingState,
      setSelectedPresetId: vi.fn(),
      setStartError,
      setVideoCaptureMode: vi.fn(),
      setVideoSettings: vi.fn(),
      setViewportPresets: vi.fn(),
      setWebcamDevices: vi.fn(),
    },
    browser: {
      refreshActiveTabCapabilities,
      refreshGalleryStatus,
    },
    mediaHub: {
      refreshGalleryStatus,
      setGalleryStatus: vi.fn(),
    },
    recording: {
      setIsStartPending: vi.fn(),
      setRecordingState,
      setStartError,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordingHandlers = undefined;
  mocks.subscribeToRecordingMessagesMock.mockImplementation((handlers) => {
    mocks.recordingHandlers = handlers;
    return vi.fn();
  });
});

it('normalizes async recording start failures through popup-owned error text', () => {
  const params = createParams();

  setupPopupLifecycle(() => params);
  mocks.recordingHandlers?.onRecordingStartFailed('Запуск записи занял слишком много времени.');

  expect(params.recording.setStartError).toHaveBeenCalledWith(
    'translated:popup.video.startRecordingTimeout'
  );
  expect(params.recording.setIsStartPending).toHaveBeenCalledWith(false);
});

it('ignores late async recording start failures after lifecycle cleanup', () => {
  const params = createParams();

  const cleanup = setupPopupLifecycle(() => params);
  cleanup();
  mocks.recordingHandlers?.onRecordingStartFailed('Запуск записи занял слишком много времени.');

  expect(params.recording.setStartError).not.toHaveBeenCalled();
  expect(params.recording.setIsStartPending).not.toHaveBeenCalled();
});
