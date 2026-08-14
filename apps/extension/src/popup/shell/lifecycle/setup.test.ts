// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PopupLifecycleParams } from './contracts';
import { DEFAULT_SCREENSHOT_SETUP_STATE } from '../../../composition/persistence/capture-settings';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';

const mocks = vi.hoisted(() => ({
  activatedListener: undefined as (() => void) | undefined,
  bootstrapPopupStateMock: vi.fn(),
  loadPopupStartupStateMock: vi.fn(),
  mediaHubListener: undefined as ((event: { type: string }) => void) | undefined,
  recordingHandlers: undefined as
    | {
        onRecordingStartFailed: (error?: string | null) => void;
        onRecordingState: (state: { status: string }) => void;
      }
    | undefined,
  subscribeToActivatedMock: vi.fn(),
  subscribeToMediaHubEventsMock: vi.fn(),
  subscribeToRecordingMessagesMock: vi.fn(),
  subscribeToUpdatedMock: vi.fn(),
  translateMock: vi.fn((key: string) => `translated:${key}`),
  unsubscribeActivatedMock: vi.fn(),
  unsubscribeMediaHubMock: vi.fn(),
  unsubscribeMessagesMock: vi.fn(),
  unsubscribeUpdatedMock: vi.fn(),
  updatedListener: undefined as
    | ((tabId: number, changeInfo: { status?: string; url?: string }, tab: chrome.tabs.Tab) => void)
    | undefined,
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
  bootstrapPopupState: mocks.bootstrapPopupStateMock,
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

vi.mock('../message-sync', (_importOriginal) => ({
  subscribeToRecordingMessages: mocks.subscribeToRecordingMessagesMock,
}));

vi.mock('../export/runtime/tab-message-routing', (_importOriginal) => ({
  consumePopupExportLaunchIntentForActiveTab: vi.fn(async () => null),
}));

import { setupPopupLifecycle } from './setup';

function createBootstrapState() {
  return {
    captureMode: 'visible' as const,
    screenshotSetupState: DEFAULT_SCREENSHOT_SETUP_STATE,
    quickActions: [{ id: 'copy', enabled: true, type: 'copy-to-clipboard' as const }],
    recordingControlCapability: null,
    recordingState: { status: VideoRecordingStatus.IDLE } as const,
    selectedPresetId: 'preset-1',
    videoSettings: { microphoneId: 'mic-1' },
    viewportPresets: [
      {
        kind: 'user',
        id: 'preset-1',
        name: 'Desktop',
        target: 'window',
        width: 1366,
        height: 768,
        enabled: true,
        order: 0,
      },
    ],
  };
}

function createParams(): PopupLifecycleParams {
  const refreshActiveTabCapabilities = vi.fn(async () => undefined);
  const refreshGalleryStatus = vi.fn(async () => undefined);
  const setRecordingState = vi.fn();
  const setStartError = vi.fn();

  return {
    bootstrap: {
      refreshActiveTabCapabilities,
      refreshGalleryStatus,
      setHomeError: vi.fn(),
      navigateToPage: vi.fn(async () => 'unchanged' as const),
      setIsReady: vi.fn(),
      setInitialScreenshotSetupState: vi.fn(),
      setQuickActions: vi.fn(),
      setQuickActionsReady: vi.fn(),
      setRecordingControlCapability: vi.fn(),
      setRecordingState,
      setSelectedPresetId: vi.fn(),
      setStartError,
      setVideoCaptureMode: vi.fn(),
      setScreenshotStartupMode: vi.fn(),
      setVideoSettings: vi.fn(),
      setViewportPresets: vi.fn(),
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

function createDeferred<T>() {
  let reject!: (error?: unknown) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

function expectBootstrappedStateApplied(
  params: PopupLifecycleParams,
  state: ReturnType<typeof createBootstrapState>
) {
  expect(params.bootstrap.setViewportPresets).toHaveBeenCalledWith(state.viewportPresets);
  expect(params.bootstrap.setQuickActions).toHaveBeenCalledWith(state.quickActions);
  expect(params.bootstrap.setQuickActionsReady).toHaveBeenCalledWith(true);
  expect(params.bootstrap.setHomeError).toHaveBeenCalledWith(null);
  expect(params.bootstrap.setVideoSettings).toHaveBeenCalledWith(state.videoSettings);
  expect(params.bootstrap.setSelectedPresetId).toHaveBeenCalledWith(state.selectedPresetId);
  expect(params.bootstrap.setVideoCaptureMode).toHaveBeenCalledWith(state.captureMode);
  expect(params.bootstrap.setRecordingControlCapability).toHaveBeenCalledWith(
    state.recordingControlCapability
  );
  expect(params.bootstrap.setRecordingState).toHaveBeenCalledWith(state.recordingState);
  expect(params.bootstrap.setInitialScreenshotSetupState).toHaveBeenCalledWith(
    state.screenshotSetupState
  );
  expect(params.bootstrap.setIsReady).toHaveBeenCalledWith(true);
  expect(params.bootstrap.refreshActiveTabCapabilities).toHaveBeenCalledTimes(1);
  expect(params.bootstrap.refreshGalleryStatus).toHaveBeenCalledTimes(1);
}

function expectLifecycleCleanup() {
  expect(mocks.unsubscribeMessagesMock).toHaveBeenCalledTimes(1);
  expect(mocks.unsubscribeMediaHubMock).toHaveBeenCalledTimes(1);
  expect(mocks.unsubscribeActivatedMock).toHaveBeenCalledTimes(1);
  expect(mocks.unsubscribeUpdatedMock).toHaveBeenCalledTimes(1);
}

function triggerPopupLifecycleEvents() {
  mocks.recordingHandlers?.onRecordingState({ status: 'recording' });
  mocks.recordingHandlers?.onRecordingStartFailed(null);
  mocks.mediaHubListener?.({ type: 'library-changed' });
  mocks.mediaHubListener?.({ type: 'storage-pressure' });
  window.dispatchEvent(new Event('focus'));
  mocks.activatedListener?.();
  mocks.updatedListener?.(1, { status: 'loading' }, { active: true } as chrome.tabs.Tab);
  mocks.updatedListener?.(1, { status: 'complete' }, { active: true } as chrome.tabs.Tab);
  mocks.updatedListener?.(1, { url: 'https://sniptale.dev' }, { active: true } as chrome.tabs.Tab);
  mocks.updatedListener?.(1, { status: 'complete' }, { active: false } as chrome.tabs.Tab);
}

beforeEach(() => {
  document.body.replaceChildren();
  mocks.activatedListener = undefined;
  mocks.mediaHubListener = undefined;
  mocks.recordingHandlers = undefined;
  mocks.updatedListener = undefined;
  mocks.translateMock.mockClear();
  mocks.unsubscribeActivatedMock.mockReset();
  mocks.unsubscribeMediaHubMock.mockReset();
  mocks.unsubscribeMessagesMock.mockReset();
  mocks.unsubscribeUpdatedMock.mockReset();
  mocks.subscribeToActivatedMock.mockReset();
  mocks.subscribeToUpdatedMock.mockReset();
  mocks.subscribeToMediaHubEventsMock.mockReset();
  mocks.subscribeToRecordingMessagesMock.mockReset();
  mocks.bootstrapPopupStateMock.mockReset();
  mocks.loadPopupStartupStateMock.mockReset();
  mocks.loadPopupStartupStateMock.mockResolvedValue({
    selection: 'remember-last',
    lastPage: 'home',
  });

  mocks.subscribeToActivatedMock.mockImplementation((listener: () => void) => {
    mocks.activatedListener = listener;
    return mocks.unsubscribeActivatedMock;
  });
  mocks.subscribeToUpdatedMock.mockImplementation(
    (
      listener: (
        tabId: number,
        changeInfo: { status?: string; url?: string },
        tab: chrome.tabs.Tab
      ) => void
    ) => {
      mocks.updatedListener = listener;
      return mocks.unsubscribeUpdatedMock;
    }
  );
  mocks.subscribeToMediaHubEventsMock.mockImplementation(
    (listener: (event: { type: string }) => void) => {
      mocks.mediaHubListener = listener;
      return mocks.unsubscribeMediaHubMock;
    }
  );
  mocks.subscribeToRecordingMessagesMock.mockImplementation(
    (handlers: {
      onRecordingStartFailed: (error?: string | null) => void;
      onRecordingState: (state: { status: string }) => void;
    }) => {
      mocks.recordingHandlers = handlers;
      return mocks.unsubscribeMessagesMock;
    }
  );
});

describe('setupPopupLifecycle', () => {
  it('bootstraps popup state, reacts to subscriptions, and cleans up browser listeners', async () => {
    const params = createParams();
    const state = createBootstrapState();
    mocks.bootstrapPopupStateMock.mockResolvedValue(state);

    const cleanup = setupPopupLifecycle(() => params);
    await vi.waitFor(() => {
      expect(params.bootstrap.setIsReady).toHaveBeenCalledWith(true);
    });

    expectBootstrappedStateApplied(params, state);

    vi.mocked(params.bootstrap.refreshActiveTabCapabilities).mockClear();
    vi.mocked(params.bootstrap.refreshGalleryStatus).mockClear();

    triggerPopupLifecycleEvents();
    expect(params.recording.setRecordingState).toHaveBeenLastCalledWith({
      status: 'recording',
    });
    expect(params.recording.setStartError).toHaveBeenCalledWith(
      'translated:popup.video.startRecordingError'
    );
    expect(params.recording.setIsStartPending).toHaveBeenCalledWith(false);
    expect(params.mediaHub.setGalleryStatus).toHaveBeenCalledWith({
      pressure: 'critical',
      text: 'translated:popup.common.galleryStatusAttention',
    });
    expect(params.bootstrap.refreshGalleryStatus).toHaveBeenCalledTimes(2);
    expect(params.bootstrap.refreshActiveTabCapabilities).toHaveBeenCalledTimes(4);

    cleanup();
    expectLifecycleCleanup();
  });

  it('skips bootstrap state application after cancellation', async () => {
    const params = createParams();
    const deferred = createDeferred<ReturnType<typeof createBootstrapState>>();
    mocks.bootstrapPopupStateMock.mockReturnValue(deferred.promise);

    const cleanup = setupPopupLifecycle(() => params);
    cleanup();

    deferred.resolve(createBootstrapState());
    await flushAsyncWork();

    expect(params.bootstrap.setViewportPresets).not.toHaveBeenCalled();
    expect(params.bootstrap.setIsReady).not.toHaveBeenCalled();
    expect(params.bootstrap.refreshActiveTabCapabilities).not.toHaveBeenCalled();
    expect(params.bootstrap.refreshGalleryStatus).not.toHaveBeenCalled();
  });
});

describe('setupPopupLifecycle error handling', () => {
  it('surfaces bootstrap failures through popup error state', async () => {
    const params = createParams();
    mocks.bootstrapPopupStateMock.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    setupPopupLifecycle(() => params);
    await flushAsyncWork();

    expect(errorSpy).toHaveBeenCalledWith(
      '[PopupLifecycle]',
      'Failed to bootstrap popup',
      expect.any(Error)
    );
    expect(params.bootstrap.setStartError).toHaveBeenCalledWith(
      'translated:popup.video.loadingPopupError'
    );
    expect(params.bootstrap.setIsReady).toHaveBeenCalledWith(true);
  });

  it('logs secondary refresh failures after bootstrap without breaking popup readiness', async () => {
    const params = createParams();
    const state = createBootstrapState();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.bootstrapPopupStateMock.mockResolvedValue(state);
    vi.mocked(params.bootstrap.refreshGalleryStatus).mockRejectedValueOnce(
      new Error('gallery refresh failed')
    );

    setupPopupLifecycle(() => params);
    await vi.waitFor(() => {
      expect(params.bootstrap.setIsReady).toHaveBeenCalledWith(true);
    });

    expect(errorSpy).toHaveBeenCalledWith(
      '[PopupLifecycle]',
      'Failed to refresh popup gallery state',
      expect.any(Error)
    );
  });
});
