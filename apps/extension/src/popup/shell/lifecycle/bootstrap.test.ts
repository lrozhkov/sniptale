import { beforeEach, expect, it, vi } from 'vitest';
import type { PopupStartupState } from '../../../composition/persistence/capture-settings/popup-startup';

const mocks = vi.hoisted(() => ({
  bootstrapPopupStateMock: vi.fn(),
  consumePopupExportLaunchIntentMock: vi.fn<() => Promise<'export' | null>>(async () => null),
  errorMock: vi.fn(),
  stagePopupExportLaunchSelectionMock: vi.fn(),
  loadPopupStartupStateMock: vi.fn<() => Promise<PopupStartupState>>(async () => ({
    selection: 'remember-last' as const,
    lastPage: 'home' as const,
  })),
  patchScreenshotSetupStateMock: vi.fn(async () => undefined),
  translateMock: vi.fn((key: string) => `translated:${key}`),
}));

vi.mock(
  '../../../composition/persistence/capture-settings/popup-startup',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../composition/persistence/capture-settings/popup-startup')
    >()),
    loadPopupStartupState: mocks.loadPopupStartupStateMock,
  })
);

vi.mock('../../../composition/persistence/capture-settings/screenshot', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../composition/persistence/capture-settings/screenshot')
  >()),
  patchScreenshotSetupState: mocks.patchScreenshotSetupStateMock,
}));

vi.mock('../export/runtime/tab-message-routing', (_importOriginal) => ({
  consumePopupExportLaunchIntentForActiveTab: mocks.consumePopupExportLaunchIntentMock,
}));

vi.mock('../export/selection/launch-selection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../export/selection/launch-selection')>()),
  stagePopupExportLaunchSelection: mocks.stagePopupExportLaunchSelectionMock,
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

import { bootstrapPopupLifecycle } from './bootstrap-workflow';

function createParams() {
  return {
    refreshActiveTabCapabilities: vi.fn(async () => undefined),
    refreshGalleryStatus: vi.fn(async () => undefined),
    setHomeError: vi.fn(),
    setPage: vi.fn(),
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
    setScreenshotStartupMode: vi.fn(),
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
    hasPostRecordResult: false,
    microphones: [{ deviceId: 'mic-1', label: 'Mic 1' }],
    webcams: [{ deviceId: 'cam-1', label: 'Cam 1' }],
    quickActions: [{ id: 'copy', enabled: true, type: 'copy-to-clipboard' as const }],
    recordingControlCapability: null,
    recordingStatusError: 'recording state unavailable',
    recordingState: { status: 'idle' } as const,
    selectedPresetId: 'preset-1',
    videoSettings: { microphoneId: 'mic-1' },
    viewportPresets: [
      {
        kind: 'user',
        id: 'preset-1',
        name: 'Desktop',
        target: 'viewport',
        width: 1366,
        height: 768,
        enabled: true,
        order: 0,
      },
    ],
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
  expect(params.setHomeError).toHaveBeenCalledWith(null);
  expect(params.setVideoSettings).toHaveBeenCalledWith(state.videoSettings);
  expect(params.setSelectedPresetId).toHaveBeenCalledWith(state.selectedPresetId);
  expect(params.setVideoCaptureMode).toHaveBeenCalledWith(state.captureMode);
  expect(params.setRecordingControlCapability).toHaveBeenCalledWith(
    state.recordingControlCapability
  );
  expect(params.setRecordingState).toHaveBeenCalledWith(state.recordingState);
  expect(params.setStartError).toHaveBeenCalledWith(state.recordingStatusError);
  expect(params.setMicrophoneDevices).toHaveBeenCalledWith(state.microphones);
  expect(params.setWebcamDevices).toHaveBeenCalledWith(state.webcams);
  expect(params.setIsReady).toHaveBeenCalledWith(true);
  expect(params.refreshActiveTabCapabilities).toHaveBeenCalledTimes(1);
  expect(params.refreshGalleryStatus).toHaveBeenCalledTimes(1);
}

beforeEach(() => {
  mocks.bootstrapPopupStateMock.mockReset();
  mocks.consumePopupExportLaunchIntentMock.mockReset();
  mocks.consumePopupExportLaunchIntentMock.mockResolvedValue(null);
  mocks.errorMock.mockReset();
  mocks.stagePopupExportLaunchSelectionMock.mockReset();
  mocks.loadPopupStartupStateMock.mockReset();
  mocks.loadPopupStartupStateMock.mockResolvedValue({
    selection: 'remember-last',
    lastPage: 'home',
  });
  mocks.patchScreenshotSetupStateMock.mockReset();
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

it('logs but does not surface a bootstrap failure after cancellation', async () => {
  const params = createParams();
  mocks.bootstrapPopupStateMock.mockRejectedValue(new Error('boom'));

  await bootstrapPopupLifecycle({
    cancelledRef: () => true,
    getParams: () => params,
  });

  expect(mocks.errorMock).toHaveBeenCalledWith('Failed to bootstrap popup', expect.any(Error));
  expect(params.setStartError).not.toHaveBeenCalled();
  expect(params.setIsReady).not.toHaveBeenCalled();
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
  expect(params.refreshActiveTabCapabilities).toHaveBeenCalledTimes(1);
  expect(params.refreshGalleryStatus).toHaveBeenCalledTimes(1);
  expect(mocks.errorMock).toHaveBeenCalledWith(
    'Failed to refresh popup secondary state',
    expect.any(Error)
  );
});

it('skips secondary refresh and readiness when cancelled after state application', async () => {
  const params = createParams();
  const state = createBootstrapState();
  const cancelledRef = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
  mocks.bootstrapPopupStateMock.mockResolvedValue(state);

  await bootstrapPopupLifecycle({
    cancelledRef,
    getParams: () => params,
  });

  expect(params.setViewportPresets).toHaveBeenCalledWith(state.viewportPresets);
  expect(params.refreshActiveTabCapabilities).not.toHaveBeenCalled();
  expect(params.refreshGalleryStatus).not.toHaveBeenCalled();
  expect(params.setIsReady).not.toHaveBeenCalled();
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

it('applies a consumed export launch intent before popup readiness', async () => {
  const params = createParams();
  mocks.bootstrapPopupStateMock.mockResolvedValue(createBootstrapState());
  mocks.consumePopupExportLaunchIntentMock.mockResolvedValueOnce('export');

  await bootstrapPopupLifecycle({
    cancelledRef: () => false,
    getParams: () => params,
  });

  expect(params.setPage).toHaveBeenCalledWith('export');
  expect(mocks.stagePopupExportLaunchSelectionMock).toHaveBeenCalledWith({
    includeAnnotations: true,
  });
  expect(params.setPage.mock.invocationCallOrder[0]).toBeLessThan(
    params.setIsReady.mock.invocationCallOrder[0]!
  );
});

it('opens the video tab when bootstrap already contains a post-record result', async () => {
  const params = createParams();
  mocks.bootstrapPopupStateMock.mockResolvedValue({
    ...createBootstrapState(),
    hasPostRecordResult: true,
  });

  await bootstrapPopupLifecycle({ cancelledRef: () => false, getParams: () => params });

  expect(params.setPage).toHaveBeenCalledTimes(1);
  expect(params.setPage).toHaveBeenCalledWith('video');
});

it('publishes an asynchronously loaded screenshot startup mode before popup readiness', async () => {
  const params = createParams();
  mocks.bootstrapPopupStateMock.mockResolvedValue(createBootstrapState());
  mocks.loadPopupStartupStateMock.mockResolvedValueOnce({
    selection: 'screenshots:desktop',
    lastPage: 'home',
  });

  await bootstrapPopupLifecycle({ cancelledRef: () => false, getParams: () => params });

  expect(params.setScreenshotStartupMode).toHaveBeenCalledWith('desktop');
  expect(params.setPage).toHaveBeenCalledWith('home');
  expect(params.setScreenshotStartupMode.mock.invocationCallOrder[0]).toBeLessThan(
    params.setIsReady.mock.invocationCallOrder[0]!
  );
});

it('keeps the toolbar export intent above a fixed startup destination', async () => {
  const params = createParams();
  mocks.bootstrapPopupStateMock.mockResolvedValue(createBootstrapState());
  mocks.consumePopupExportLaunchIntentMock.mockResolvedValueOnce('export');
  mocks.loadPopupStartupStateMock.mockResolvedValueOnce({
    selection: 'video:screen',
    lastPage: 'video',
  });

  await bootstrapPopupLifecycle({ cancelledRef: () => false, getParams: () => params });

  expect(params.setPage).toHaveBeenCalledTimes(1);
  expect(params.setPage).toHaveBeenCalledWith('export');
  expect(params.setVideoCaptureMode).toHaveBeenCalledTimes(1);
  expect(mocks.stagePopupExportLaunchSelectionMock).toHaveBeenCalledWith({
    includeAnnotations: true,
  });
});

it('keeps ordinary popup navigation when launch-intent delivery fails', async () => {
  const params = createParams();
  mocks.bootstrapPopupStateMock.mockResolvedValue(createBootstrapState());
  mocks.consumePopupExportLaunchIntentMock.mockRejectedValueOnce(new Error('route unavailable'));

  await bootstrapPopupLifecycle({
    cancelledRef: () => false,
    getParams: () => params,
  });

  expect(params.setPage).toHaveBeenCalledWith('home');
  expect(params.setIsReady).toHaveBeenCalledWith(true);
  expect(mocks.errorMock).toHaveBeenCalledWith(
    'Failed to consume popup export launch intent',
    expect.any(Error)
  );
});
