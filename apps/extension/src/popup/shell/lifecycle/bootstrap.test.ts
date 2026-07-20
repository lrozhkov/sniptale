import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  bootstrapPopupStateMock: vi.fn(),
  errorMock: vi.fn(),
  translateMock: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock('../../../platform/i18n', (_importOriginal) => ({
  translate: mocks.translateMock,
}));

vi.mock('@sniptale/platform/observability/logger', (_importOriginal) => ({
  createLogger: () => ({
    error: mocks.errorMock,
  }),
}));

vi.mock('../bootstrap', (_importOriginal) => ({
  bootstrapPopupState: mocks.bootstrapPopupStateMock,
}));

import { bootstrapPopupLifecycle } from './bootstrap/run';

function createParams() {
  return {
    clearAppliedViewportAuthority: vi.fn(),
    refreshActiveTabCapabilities: vi.fn(async () => undefined),
    refreshGalleryStatus: vi.fn(async () => undefined),
    setDisplayMode: vi.fn(),
    setHomeError: vi.fn(),
    setIsReady: vi.fn(),
    setMicrophoneDevices: vi.fn(),
    setWebcamDevices: vi.fn(),
    setQuickActions: vi.fn(),
    setQuickActionsReady: vi.fn(),
    setRecordingControlCapability: vi.fn(),
    setRecordingState: vi.fn(),
    setSelectedPresetId: vi.fn(),
    setStartError: vi.fn(),
    setVideoCaptureMode: vi.fn(),
    setVideoSettings: vi.fn(),
    setViewportPresets: vi.fn(),
  };
}

function createDeferred<T>() {
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve: resolvePromise!,
  };
}

function createBootstrapState() {
  return {
    captureMode: 'visible' as const,
    microphones: [{ deviceId: 'mic-1', label: 'Mic 1' }],
    webcams: [{ deviceId: 'cam-1', label: 'Cam 1' }],
    quickActions: [{ id: 'copy', enabled: true, type: 'copy-to-clipboard' as const }],
    quickActionsMode: 'grid' as const,
    recordingControlCapability: null,
    recordingState: { status: 'idle' } as const,
    selectedPresetId: 'preset-1',
    videoSettings: { microphoneId: 'mic-1' },
    viewportPresets: [{ id: 'preset-1', label: 'Desktop', height: 768, width: 1366 }],
  };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

function expectBootstrappedStateApplied(
  params: ReturnType<typeof createParams>,
  state: ReturnType<typeof createBootstrapState>
) {
  expect(params.setViewportPresets).toHaveBeenCalledWith(state.viewportPresets);
  expect(params.setQuickActions).toHaveBeenCalledWith(state.quickActions);
  expect(params.setQuickActionsReady).toHaveBeenCalledWith(true);
  expect(params.setDisplayMode).toHaveBeenCalledWith(state.quickActionsMode);
  expect(params.setHomeError).toHaveBeenCalledWith(null);
  expect(params.setVideoSettings).toHaveBeenCalledWith(state.videoSettings);
  expect(params.setSelectedPresetId).toHaveBeenCalledWith(state.selectedPresetId);
  expect(params.setVideoCaptureMode).toHaveBeenCalledWith(state.captureMode);
  expect(params.setRecordingControlCapability).toHaveBeenCalledWith(
    state.recordingControlCapability
  );
  expect(params.setRecordingState).toHaveBeenCalledWith(state.recordingState);
  expect(params.setMicrophoneDevices).toHaveBeenCalledWith(state.microphones);
  expect(params.setIsReady).toHaveBeenCalledWith(true);
  expect(params.refreshActiveTabCapabilities).toHaveBeenCalledTimes(1);
  expect(params.refreshGalleryStatus).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  mocks.bootstrapPopupStateMock.mockReset();
  mocks.errorMock.mockReset();
  mocks.translateMock.mockClear();
});

it('applies bootstrapped state and refreshes popup secondary state', async () => {
  const params = createParams();
  const state = createBootstrapState();
  mocks.bootstrapPopupStateMock.mockResolvedValue(state);

  await bootstrapPopupLifecycle({
    cancelledRef: () => false,
    getParams: () => params,
  });

  expectBootstrappedStateApplied(params, state);
});

it('surfaces bootstrap failures through popup error state', async () => {
  const params = createParams();
  mocks.bootstrapPopupStateMock.mockRejectedValue(new Error('boom'));

  await bootstrapPopupLifecycle({
    cancelledRef: () => false,
    getParams: () => params,
  });

  expect(mocks.errorMock).toHaveBeenCalledWith('Failed to bootstrap popup', expect.any(Error));
  expect(params.setStartError).toHaveBeenCalledWith('translated:popup.video.loadingPopupError');
  expect(params.setIsReady).toHaveBeenCalledWith(true);
});

it('logs secondary refresh failures without blocking ready state', async () => {
  const params = createParams();
  const state = createBootstrapState();
  mocks.bootstrapPopupStateMock.mockResolvedValue(state);
  vi.mocked(params.refreshActiveTabCapabilities).mockRejectedValueOnce(new Error('boom'));

  await bootstrapPopupLifecycle({
    cancelledRef: () => false,
    getParams: () => params,
  });

  await flushAsyncWork();

  expect(params.setViewportPresets).toHaveBeenCalledWith(state.viewportPresets);
  expect(params.setIsReady).toHaveBeenCalledWith(true);
  expect(mocks.errorMock).toHaveBeenCalledWith(
    'Failed to refresh popup secondary state',
    expect.any(Error)
  );
});

it('waits for secondary refresh before marking the popup ready', async () => {
  const params = createParams();
  const state = createBootstrapState();
  const refreshDeferred = createDeferred<undefined>();
  mocks.bootstrapPopupStateMock.mockResolvedValue(state);
  vi.mocked(params.refreshActiveTabCapabilities).mockReturnValueOnce(refreshDeferred.promise);

  const bootstrapPromise = bootstrapPopupLifecycle({
    cancelledRef: () => false,
    getParams: () => params,
  });

  await flushAsyncWork();

  expect(params.setViewportPresets).toHaveBeenCalledWith(state.viewportPresets);
  expect(params.setIsReady).not.toHaveBeenCalled();

  refreshDeferred.resolve(undefined);
  await bootstrapPromise;

  expect(params.setIsReady).toHaveBeenCalledWith(true);
});
