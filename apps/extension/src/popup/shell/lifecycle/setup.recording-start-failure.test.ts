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

import { setupPopupLifecycle } from './setup';
import type { PopupLifecycleParams } from './types';

function createParams(): PopupLifecycleParams {
  return {
    clearAppliedViewportAuthority: vi.fn(),
    refreshActiveTabCapabilities: vi.fn(async () => undefined),
    refreshGalleryStatus: vi.fn(async () => undefined),
    setDisplayMode: vi.fn(),
    setGalleryStatus: vi.fn(),
    setHomeError: vi.fn(),
    setIsReady: vi.fn(),
    setIsStartPending: vi.fn(),
    setMicrophoneDevices: vi.fn(),
    setQuickActions: vi.fn(),
    setQuickActionsReady: vi.fn(),
    setRecordingControlCapability: vi.fn(),
    setRecordingState: vi.fn(),
    setSelectedPresetId: vi.fn(),
    setStartError: vi.fn(),
    setVideoCaptureMode: vi.fn(),
    setVideoSettings: vi.fn(),
    setViewportPresets: vi.fn(),
    setWebcamDevices: vi.fn(),
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

  expect(params.setStartError).toHaveBeenCalledWith('translated:popup.video.startRecordingTimeout');
  expect(params.setIsStartPending).toHaveBeenCalledWith(false);
});

it('ignores late async recording start failures after lifecycle cleanup', () => {
  const params = createParams();

  const cleanup = setupPopupLifecycle(() => params);
  cleanup();
  mocks.recordingHandlers?.onRecordingStartFailed('Запуск записи занял слишком много времени.');

  expect(params.setStartError).not.toHaveBeenCalled();
  expect(params.setIsStartPending).not.toHaveBeenCalled();
});
