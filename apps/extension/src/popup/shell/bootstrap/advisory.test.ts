import { beforeEach, describe, expect, it, vi } from 'vitest';

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

vi.mock('../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));

vi.mock('../navigation/actions', (_importOriginal) => ({
  IDLE_RECORDING_STATE: {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 0,
    error: null,
    status: 'IDLE',
    viewportPreset: null,
  },
}));

vi.mock('../../recording/microphone', (_importOriginal) => ({
  loadMicrophoneDevices: mocks.loadMicrophoneDevicesMock,
  resolveMicrophoneDeviceId: mocks.resolveMicrophoneDeviceIdMock,
}));

vi.mock('../../diagnostics/performance', (_importOriginal) => ({
  startPopupPerfSpan: mocks.startPopupPerfSpanMock,
  trackPopupPerfAsync: mocks.trackPopupPerfAsyncMock,
}));

function createPerfSpan() {
  return { end: vi.fn(), fail: vi.fn() };
}

function createSettings() {
  return {
    captureAction: 'download_default',
    defaultExportPresetId: null,
    defaultImagePresetId: null,
    defaultVideoPresetId: 'preset-2',
    imageFormat: 'png',
    imageQuality: 92,
    presets: [],
    saveCapturesToGallery: false,
    viewportPresets: [{ height: 1080, id: 'preset-2', label: 'Full HD', width: 1920 }],
  };
}

function createVideoSettings() {
  return {
    autoFadeDelay: 0,
    countdownSeconds: 3,
    diagnosticsEnabled: false,
    microphoneDeviceId: null,
    microphoneEnabled: false,
    openEditorAfterRecording: true,
    quality: 'HIGH',
    systemAudioEnabled: true,
  };
}

function createVideoUiState() {
  return {
    captureMode: 'TAB',
    viewportPresetId: 'preset-2',
  };
}

async function importPopupBootstrapModule() {
  vi.resetModules();
  return import('./index');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.trackPopupPerfAsyncMock.mockImplementation(
    async (_label: string, task: () => Promise<unknown>) => task()
  );
  mocks.startPopupPerfSpanMock.mockImplementation(() => createPerfSpan());
  mocks.loadSettingsMock.mockResolvedValue(createSettings());
  mocks.loadVideoSettingsMock.mockResolvedValue(createVideoSettings());
  mocks.loadVideoUiStateMock.mockResolvedValue(createVideoUiState());
  mocks.runtimeTransportMock.sendRuntimeMessage.mockResolvedValue({
    recordingHealth: 'healthy',
    state: {
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 12,
      error: null,
      status: 'RECORDING',
      viewportPreset: null,
    },
    success: true,
  });
  mocks.loadMicrophoneDevicesMock.mockResolvedValue([]);
  mocks.resolveMicrophoneDeviceIdMock.mockReturnValue(null);
});

describe('popup-bootstrap advisory fallbacks', () => {
  it('keeps bootstrapping when quick-actions sources fail', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    mocks.getQuickActionsBootstrapDataMock.mockRejectedValueOnce(new Error('actions failed'));

    const module = await importPopupBootstrapModule();
    const result = await module.bootstrapPopupState();

    expect(result.homeError).toBe('popup.home.quickActionsLoadError');
    expect(result.quickActions).toEqual([]);
    expect(result.quickActionsMode).toBe('list');
    expect(errorSpy).toHaveBeenCalledWith(
      '[PopupBootstrap]',
      'Failed to bootstrap quick actions',
      expect.any(Error)
    );
  });
});
