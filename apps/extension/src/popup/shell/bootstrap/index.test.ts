import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupBootstrapResult } from './index';
import { DEFAULT_SCREENSHOT_SETUP_STATE } from '../../../composition/persistence/capture-settings';
import {
  createPopupBootstrapRecordingState,
  createPopupBootstrapSettings,
  createPopupBootstrapVideoSettings,
  createPopupBootstrapVideoUiState,
} from './index.test-support';

const mocks = vi.hoisted(() => ({
  getQuickActionsMock: vi.fn(),
  loadScreenshotSetupStateMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loadVideoSettingsMock: vi.fn(),
  loadVideoUiStateMock: vi.fn(),
  runtimeTransportMock: { sendRuntimeMessage: vi.fn(), sendTabMessage: vi.fn() },
  startPopupPerfSpanMock: vi.fn(),
  trackPopupPerfAsyncMock: vi.fn(),
}));

vi.mock('../../../composition/persistence/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/settings')>()),
  loadSettings: mocks.loadSettingsMock,
}));
vi.mock('../../../composition/persistence/capture-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/capture-settings')>()),
  loadVideoSettings: mocks.loadVideoSettingsMock,
  loadVideoUiState: mocks.loadVideoUiStateMock,
  loadScreenshotSetupState: mocks.loadScreenshotSetupStateMock,
}));
vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActions: mocks.getQuickActionsMock,
}));
vi.mock('../../../platform/runtime-messaging', (_importOriginal) => ({
  createRuntimeMessagingTransport: () => mocks.runtimeTransportMock,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../diagnostics/performance', (_importOriginal) => ({
  startPopupPerfSpan: mocks.startPopupPerfSpanMock,
  trackPopupPerfAsync: mocks.trackPopupPerfAsyncMock,
}));

vi.mock('../../recording/video/copy', (_importOriginal) => ({
  IDLE_RECORDING_STATE: {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 0,
    error: null,
    status: VideoRecordingStatus.IDLE,
    viewportPresetId: null,
  },
}));

function createPerfSpan() {
  return { end: vi.fn(), fail: vi.fn() };
}
async function importPopupBootstrapModule() {
  vi.resetModules();
  return import('./index');
}

function expectHydratedBootstrapResult(result: PopupBootstrapResult) {
  expect(mocks.runtimeTransportMock.sendRuntimeMessage).toHaveBeenCalledWith({
    type: 'GET_RECORDING_STATE',
  });
  expect(result).toEqual({
    captureMode: CaptureMode.TAB,
    hasPostRecordResult: false,
    homeError: null,
    screenshotSetupState: DEFAULT_SCREENSHOT_SETUP_STATE,
    quickActions: [
      expect.objectContaining({
        id: 'enabled',
        status: true,
      }),
    ],
    recordingControlCapability: {
      controlToken: 'control-token-1',
      recordingId: 'recording-1',
    },
    recordingState: createPopupBootstrapRecordingState(),
    recordingStatusError: null,
    selectedPresetId: null,
    videoSettings: expect.objectContaining({ microphoneDeviceId: 'missing-device' }),
    viewportPresets: createPopupBootstrapSettings().viewportPresets,
  });
}

function configureFailedRecordingBootstrapResponse() {
  mocks.loadSettingsMock.mockResolvedValue(
    createPopupBootstrapSettings({
      defaultVideoPresetId: 'preset-1',
    })
  );
  mocks.loadVideoSettingsMock.mockResolvedValue(
    createPopupBootstrapVideoSettings({
      microphoneEnabled: false,
    })
  );
  mocks.loadVideoUiStateMock.mockResolvedValue(
    createPopupBootstrapVideoUiState({
      captureMode: CaptureMode.TAB,
      viewportPresetId: 'missing-preset',
    })
  );
  mocks.runtimeTransportMock.sendRuntimeMessage.mockResolvedValue({
    recordingHealth: 'failed',
    state: null,
    success: false,
  });
}

async function verifiesFailedRecordingBootstrapFallback() {
  configureFailedRecordingBootstrapResponse();

  const module = await importPopupBootstrapModule();
  const result = await module.bootstrapPopupState();

  expect(result.recordingState.status).toBe(VideoRecordingStatus.IDLE);
  expect(result.recordingStatusError).toBe('background.runtime.recordingUnavailable');
  expect(result.captureMode).toBe(CaptureMode.TAB);
  expect(result.selectedPresetId).toBeNull();
  expect(result.videoSettings.microphoneDeviceId).toBe('missing-device');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trackPopupPerfAsyncMock.mockImplementation(
    async (_label: string, task: () => Promise<unknown>) => task()
  );
  mocks.startPopupPerfSpanMock.mockImplementation(() => createPerfSpan());
  mocks.getQuickActionsMock.mockResolvedValue([
    {
      afterCapture: 'download_default',
      exitAfterCapture: false,
      icon: 'camera',
      id: 'enabled',
      name: 'Enabled',
      screenshotMode: 'visible',
      status: true,
    },
    {
      afterCapture: 'download_default',
      exitAfterCapture: false,
      icon: 'camera',
      id: 'disabled',
      name: 'Disabled',
      screenshotMode: 'full',
      status: false,
    },
  ]);
  mocks.loadSettingsMock.mockResolvedValue(createPopupBootstrapSettings());
  mocks.loadVideoSettingsMock.mockResolvedValue(createPopupBootstrapVideoSettings());
  mocks.loadVideoUiStateMock.mockResolvedValue(createPopupBootstrapVideoUiState());
  mocks.loadScreenshotSetupStateMock.mockResolvedValue(DEFAULT_SCREENSHOT_SETUP_STATE);
  mocks.runtimeTransportMock.sendRuntimeMessage.mockResolvedValue({
    controlToken: 'control-token-1',
    recordingHealth: 'healthy',
    recordingId: 'recording-1',
    state: createPopupBootstrapRecordingState(),
    success: true,
  });
});

describe('popup-bootstrap hydration', () => {
  it('builds popup bootstrap state from storage, runtime messaging, and microphone hydration', async () => {
    const result = await (await importPopupBootstrapModule()).bootstrapPopupState();
    expectHydratedBootstrapResult(result);
  });
});

describe('popup-bootstrap fallbacks', () => {
  it(
    'falls back to idle recording state without replacing the stored microphone preference',
    verifiesFailedRecordingBootstrapFallback
  );
});
