import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import type { PopupBootstrapResult } from './index';
import {
  createPopupBootstrapRecordingState,
  createPopupBootstrapSettings,
  createPopupBootstrapVideoSettings,
  createPopupBootstrapVideoUiState,
} from './index.test-support';

const mocks = vi.hoisted(() => ({
  getQuickActionsBootstrapDataMock: vi.fn(),
  loadMicrophoneDevicesMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loadVideoSettingsMock: vi.fn(),
  loadVideoUiStateMock: vi.fn(),
  resolveMicrophoneDeviceIdMock: vi.fn(),
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
}));
vi.mock('../../../composition/persistence/quick-actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../composition/persistence/quick-actions')>()),
  getQuickActionsBootstrapData: mocks.getQuickActionsBootstrapDataMock,
}));
vi.mock('../../../platform/runtime-messaging', (_importOriginal) => ({
  createRuntimeMessagingTransport: () => mocks.runtimeTransportMock,
}));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('../../recording/microphone', (_importOriginal) => ({
  loadMicrophoneDevices: mocks.loadMicrophoneDevicesMock,
  resolveMicrophoneDeviceId: mocks.resolveMicrophoneDeviceIdMock,
}));

vi.mock('../../diagnostics/performance', (_importOriginal) => ({
  startPopupPerfSpan: mocks.startPopupPerfSpanMock,
  trackPopupPerfAsync: mocks.trackPopupPerfAsyncMock,
}));

vi.mock('../navigation/actions', (_importOriginal) => ({
  IDLE_RECORDING_STATE: {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 0,
    error: null,
    status: VideoRecordingStatus.IDLE,
    viewportPreset: null,
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
  expect(mocks.loadMicrophoneDevicesMock).toHaveBeenNthCalledWith(1);
  expect(mocks.loadMicrophoneDevicesMock).toHaveBeenNthCalledWith(2, {
    hydrateLabels: 'if-permission-granted',
    knownDevices: [{ deviceId: 'mic-known', label: 'Known Mic' }],
    preferredDeviceId: 'missing-device',
  });
  expect(mocks.resolveMicrophoneDeviceIdMock).toHaveBeenCalledWith('missing-device', [
    { deviceId: 'mic-2', label: 'Hydrated Mic' },
  ]);
  expect(result).toEqual({
    captureMode: CaptureMode.TAB,
    homeError: null,
    microphones: [{ deviceId: 'mic-2', label: 'Hydrated Mic' }],
    quickActions: [
      expect.objectContaining({
        id: 'enabled',
        status: true,
      }),
    ],
    quickActionsMode: 'list',
    recordingControlCapability: {
      controlToken: 'control-token-1',
      recordingId: 'recording-1',
    },
    recordingState: createPopupBootstrapRecordingState(),
    recordingStatusError: null,
    selectedPresetId: null,
    videoSettings: expect.objectContaining({ microphoneDeviceId: 'mic-2' }),
    viewportPresets: createPopupBootstrapSettings().viewportPresets,
    webcams: [],
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
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      viewportPresetId: 'missing-preset',
    })
  );
  mocks.runtimeTransportMock.sendRuntimeMessage.mockResolvedValue({
    recordingHealth: 'failed',
    state: null,
    success: false,
  });
  mocks.loadMicrophoneDevicesMock.mockReset();
  mocks.loadMicrophoneDevicesMock.mockResolvedValue([
    { deviceId: 'mic-passive', label: 'Passive Mic' },
  ]);
}

async function verifiesFailedRecordingBootstrapFallback() {
  configureFailedRecordingBootstrapResponse();

  const module = await importPopupBootstrapModule();
  const result = await module.bootstrapPopupState();

  expect(mocks.loadMicrophoneDevicesMock).toHaveBeenCalledTimes(1);
  expect(result.recordingState.status).toBe(VideoRecordingStatus.IDLE);
  expect(result.recordingStatusError).toBe('background.runtime.recordingUnavailable');
  expect(result.captureMode).toBe(CaptureMode.TAB);
  expect(result.selectedPresetId).toBeNull();
  expect(result.videoSettings.microphoneDeviceId).toBe('mic-passive');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trackPopupPerfAsyncMock.mockImplementation(
    async (_label: string, task: () => Promise<unknown>) => task()
  );
  mocks.startPopupPerfSpanMock.mockImplementation(() => createPerfSpan());
  mocks.getQuickActionsBootstrapDataMock.mockResolvedValue({
    actions: [
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
    ],
    displayMode: 'list',
  });
  mocks.loadSettingsMock.mockResolvedValue(createPopupBootstrapSettings());
  mocks.loadVideoSettingsMock.mockResolvedValue(createPopupBootstrapVideoSettings());
  mocks.loadVideoUiStateMock.mockResolvedValue(createPopupBootstrapVideoUiState());
  mocks.runtimeTransportMock.sendRuntimeMessage.mockResolvedValue({
    controlToken: 'control-token-1',
    recordingHealth: 'healthy',
    recordingId: 'recording-1',
    state: createPopupBootstrapRecordingState(),
    success: true,
  });
  mocks.loadMicrophoneDevicesMock
    .mockResolvedValueOnce([{ deviceId: 'mic-known', label: 'Known Mic' }])
    .mockResolvedValueOnce([{ deviceId: 'mic-2', label: 'Hydrated Mic' }]);
  mocks.resolveMicrophoneDeviceIdMock.mockImplementation(
    (_deviceId: string | null, devices: Array<{ deviceId: string }>) => devices[0]?.deviceId ?? null
  );
});

describe('popup-bootstrap hydration', () => {
  it('builds popup bootstrap state from storage, runtime messaging, and microphone hydration', async () => {
    const result = await (await importPopupBootstrapModule()).bootstrapPopupState();
    expectHydratedBootstrapResult(result);
  });
});

describe('popup-bootstrap fallbacks', () => {
  it(
    'falls back to idle recording state, default preset selection, and default transport',
    verifiesFailedRecordingBootstrapFallback
  );
});

describe('popup-bootstrap microphone failures', () => {
  it('returns an empty microphone list when bootstrap microphone loading fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const perfSpan = createPerfSpan();
    mocks.startPopupPerfSpanMock
      .mockReturnValueOnce(perfSpan)
      .mockReturnValueOnce(createPerfSpan());
    mocks.loadVideoSettingsMock.mockResolvedValue(
      createPopupBootstrapVideoSettings({
        microphoneEnabled: false,
      })
    );
    mocks.loadMicrophoneDevicesMock.mockReset();
    mocks.loadMicrophoneDevicesMock.mockRejectedValue(new Error('mic failure'));

    const module = await importPopupBootstrapModule();
    const result = await module.bootstrapPopupStateWithTransport({
      sendRuntimeMessage: vi.fn().mockResolvedValue({
        recordingHealth: 'healthy',
        state: createPopupBootstrapRecordingState(),
        success: true,
      }),
      sendTabMessage: vi.fn(),
    });

    expect(result.microphones).toEqual([]);
    expect(perfSpan.end).toHaveBeenCalledWith({
      microphoneCount: 0,
      quickActionCount: 1,
      viewportPresetCount: 2,
    });
    expect(errorSpy).toHaveBeenCalledWith(
      '[PopupBootstrap]',
      'Failed to bootstrap microphones',
      expect.any(Error)
    );
  });
});
