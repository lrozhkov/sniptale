import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  loadMicrophoneDevicesMock: vi.fn(),
  loadWebcamDevicesMock: vi.fn(),
  loadSettingsMock: vi.fn(),
  loadVideoSettingsMock: vi.fn(),
  loadVideoUiStateMock: vi.fn(),
  resolveMicrophoneDeviceIdMock: vi.fn(),
  resolveWebcamDeviceIdMock: vi.fn(),
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

vi.mock('../../recording/microphone', (_importOriginal) => ({
  loadMicrophoneDevices: mocks.loadMicrophoneDevicesMock,
  resolveMicrophoneDeviceId: mocks.resolveMicrophoneDeviceIdMock,
}));

vi.mock('../../recording/webcam', (_importOriginal) => ({
  loadWebcamDevices: mocks.loadWebcamDevicesMock,
  resolveWebcamDeviceId: mocks.resolveWebcamDeviceIdMock,
}));

vi.mock('../../diagnostics/performance', (_importOriginal) => ({
  trackPopupPerfAsync: mocks.trackPopupPerfAsyncMock,
}));

function createSettings(overrides: Record<string, unknown> = {}) {
  return {
    captureAction: 'download_default',
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: 'preset-2',
    imageFormat: 'png',
    imageQuality: 92,
    presets: [],
    saveCapturesToGallery: false,
    viewportPresets: [
      { height: 720, id: 'preset-1', label: 'Compact', width: 1280 },
      { height: 1080, id: 'preset-2', label: 'Full HD', width: 1920 },
    ],
    ...overrides,
  };
}

function createVideoSettings(overrides: Record<string, unknown> = {}) {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: 'missing-device',
    microphoneEnabled: true,
    webcamDeviceId: 'missing-camera',
    webcamEnabled: true,
    openEditorAfterRecording: true,
    quality: VideoQuality.HIGH,
    systemAudioEnabled: true,
    ...overrides,
  };
}

function createVideoUiState(overrides: Record<string, unknown> = {}) {
  return {
    captureMode: CaptureMode.VIEWPORT_EMULATION,
    viewportPresetId: 'missing-preset',
    ...overrides,
  };
}

async function importPopupVideoModule() {
  vi.resetModules();
  return import('./video');
}

async function verifiesHydratedPopupVideoBootstrapState() {
  const module = await importPopupVideoModule();
  const result = await module.loadPopupBootstrapVideoData(
    module.createPopupVideoBootstrapPromises()
  );

  expect(mocks.loadMicrophoneDevicesMock).toHaveBeenNthCalledWith(1);
  expect(mocks.loadMicrophoneDevicesMock).toHaveBeenNthCalledWith(2, {
    hydrateLabels: 'if-permission-granted',
    knownDevices: [{ deviceId: 'mic-known', label: 'Known Mic' }],
    preferredDeviceId: 'missing-device',
  });
  expect(mocks.loadWebcamDevicesMock).toHaveBeenNthCalledWith(2, {
    hydrateLabels: 'if-permission-granted',
    knownDevices: [{ deviceId: 'cam-known', label: 'Known Camera' }],
    preferredDeviceId: 'missing-camera',
  });
  expect(mocks.resolveMicrophoneDeviceIdMock).toHaveBeenCalledWith('missing-device', [
    { deviceId: 'mic-2', label: 'Hydrated Mic' },
  ]);
  expect(mocks.resolveWebcamDeviceIdMock).toHaveBeenCalledWith('missing-camera', [
    { deviceId: 'cam-2', label: 'Hydrated Camera' },
  ]);
  expect(result).toEqual({
    captureMode: CaptureMode.TAB,
    microphones: [{ deviceId: 'mic-2', label: 'Hydrated Mic' }],
    webcams: [{ deviceId: 'cam-2', label: 'Hydrated Camera' }],
    selectedPresetId: null,
    videoSettings: expect.objectContaining({
      microphoneDeviceId: 'mic-2',
      webcamDeviceId: 'cam-2',
    }),
    viewportPresets: createSettings().viewportPresets,
  });
}

async function verifiesViewportFallbackCaptureMode() {
  mocks.loadSettingsMock.mockResolvedValue(
    createSettings({
      defaultVideoPresetId: 'preset-1',
    })
  );
  mocks.loadVideoSettingsMock.mockResolvedValue(
    createVideoSettings({
      microphoneEnabled: false,
      webcamEnabled: false,
    })
  );
  mocks.loadVideoUiStateMock.mockResolvedValue(
    createVideoUiState({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      viewportPresetId: 'missing-preset',
    })
  );
  mocks.loadMicrophoneDevicesMock.mockReset();
  mocks.loadMicrophoneDevicesMock.mockResolvedValue([
    { deviceId: 'mic-passive', label: 'Passive Mic' },
  ]);

  const module = await importPopupVideoModule();
  const result = await module.loadPopupBootstrapVideoData(
    module.createPopupVideoBootstrapPromises()
  );

  expect(result.captureMode).toBe(CaptureMode.TAB);
  expect(result.selectedPresetId).toBeNull();
  expect(result.videoSettings.microphoneDeviceId).toBe('mic-passive');
  expect(mocks.loadMicrophoneDevicesMock).toHaveBeenCalledTimes(1);
  expect(mocks.loadWebcamDevicesMock).toHaveBeenCalledTimes(1);
}

async function verifiesMicrophoneBootstrapFailureFallback() {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.loadVideoSettingsMock.mockResolvedValue(
    createVideoSettings({
      microphoneEnabled: false,
    })
  );
  mocks.loadMicrophoneDevicesMock.mockReset();
  mocks.loadMicrophoneDevicesMock.mockRejectedValue(new Error('mic failure'));

  const module = await importPopupVideoModule();
  const result = await module.loadPopupBootstrapVideoData(
    module.createPopupVideoBootstrapPromises()
  );

  expect(result.microphones).toEqual([]);
  expect(errorSpy).toHaveBeenCalledWith(
    '[PopupBootstrap]',
    'Failed to bootstrap microphones',
    expect.any(Error)
  );
}

async function verifiesWebcamBootstrapFailureFallback() {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  mocks.loadVideoSettingsMock.mockResolvedValue(
    createVideoSettings({
      microphoneEnabled: false,
      webcamEnabled: false,
    })
  );
  mocks.loadWebcamDevicesMock.mockReset();
  mocks.loadWebcamDevicesMock.mockRejectedValue(new Error('webcam failure'));

  const module = await importPopupVideoModule();
  const result = await module.loadPopupBootstrapVideoData(
    module.createPopupVideoBootstrapPromises()
  );

  expect(result.webcams).toEqual([]);
  expect(errorSpy).toHaveBeenCalledWith(
    '[PopupBootstrap]',
    'Failed to bootstrap webcams',
    expect.any(Error)
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trackPopupPerfAsyncMock.mockImplementation(
    async (_label: string, task: () => Promise<unknown>) => task()
  );
  mocks.loadSettingsMock.mockResolvedValue(createSettings());
  mocks.loadVideoSettingsMock.mockResolvedValue(createVideoSettings());
  mocks.loadVideoUiStateMock.mockResolvedValue(createVideoUiState());
  mocks.loadMicrophoneDevicesMock
    .mockResolvedValueOnce([{ deviceId: 'mic-known', label: 'Known Mic' }])
    .mockResolvedValueOnce([{ deviceId: 'mic-2', label: 'Hydrated Mic' }]);
  mocks.loadWebcamDevicesMock
    .mockResolvedValueOnce([{ deviceId: 'cam-known', label: 'Known Camera' }])
    .mockResolvedValueOnce([{ deviceId: 'cam-2', label: 'Hydrated Camera' }]);
  mocks.resolveMicrophoneDeviceIdMock.mockImplementation(
    (_deviceId: string | null, devices: Array<{ deviceId: string }>) => devices[0]?.deviceId ?? null
  );
  mocks.resolveWebcamDeviceIdMock.mockImplementation(
    (_deviceId: string | null, devices: Array<{ deviceId: string }>) => devices[0]?.deviceId ?? null
  );
});

describe('popup-bootstrap video owner', () => {
  it(
    'hydrates popup video bootstrap state from storage and microphone resolution',
    verifiesHydratedPopupVideoBootstrapState
  );
  it(
    'falls back to tab capture when viewport emulation has no resolved preset',
    verifiesViewportFallbackCaptureMode
  );
  it(
    'returns an empty microphone list when bootstrap microphone loading fails',
    verifiesMicrophoneBootstrapFailureFallback
  );
  it(
    'returns an empty webcam list when bootstrap webcam loading fails',
    verifiesWebcamBootstrapFailureFallback
  );
});
