// @vitest-environment jsdom
import { act } from 'react';
import type { ReactElement, SetStateAction } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CaptureMode,
  VideoQuality,
  VideoRecordingStatus,
  type VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { PopupPage } from '../navigation/actions';
import { usePopupRuntimeEffects } from './effects';
const { loggerErrorMock, persistVideoSettingsMock, persistVideoUiStateMock, toastErrorMock } =
  vi.hoisted(() => ({
    loggerErrorMock: vi.fn(),
    persistVideoSettingsMock: vi.fn(),
    persistVideoUiStateMock: vi.fn(),
    toastErrorMock: vi.fn(),
  }));
vi.mock('@sniptale/platform/observability/logger', (_importOriginal) => ({
  createLogger: ({ namespace }: { namespace: string }) => ({
    child: () => {
      throw new Error(`Logger child() is not expected in ${namespace} tests`);
    },
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));
vi.mock('../../../platform/i18n', (_importOriginal) => ({
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-feedback/toast-service', (_importOriginal) => ({
  toast: {
    error: toastErrorMock,
  },
}));
vi.mock('../../recording/microphone', (_importOriginal) => ({
  resolveMicrophoneDeviceId: (deviceId: string | null) => deviceId,
}));
vi.mock('../../recording/webcam', (_importOriginal) => ({
  resolveWebcamDeviceId: (deviceId: string | null) => deviceId,
}));
vi.mock('../../recording/persistence', (_importOriginal) => ({
  persistVideoSettings: persistVideoSettingsMock,
  persistVideoUiState: persistVideoUiStateMock,
}));
let container: HTMLDivElement | null = null;
let root: Root | null = null;
let setIsStartPendingMock: ReturnType<typeof vi.fn<(value: SetStateAction<boolean>) => void>>;
let setPageMock: ReturnType<typeof vi.fn<(value: SetStateAction<PopupPage>) => void>>;
let setRecordingControlCapabilityMock: ReturnType<
  typeof vi.fn<
    (value: SetStateAction<{ controlToken: string; recordingId: string } | null>) => void
  >
>;
let setSelectedPresetIdMock: ReturnType<
  typeof vi.fn<(value: SetStateAction<string | null>) => void>
>;
let setStartErrorMock: ReturnType<typeof vi.fn<(value: SetStateAction<string | null>) => void>>;
let setVideoCaptureModeMock: ReturnType<typeof vi.fn<(value: SetStateAction<CaptureMode>) => void>>;
let setVideoSettingsMock: ReturnType<
  typeof vi.fn<(value: SetStateAction<VideoRecordingSettings>) => void>
>;

function createRecordingState(status: VideoRecordingStatus) {
  return {
    captureMode: null,
    captureSource: null,
    countdownEndsAt: null,
    duration: 12,
    error: null,
    status,
    viewportPreset: null,
  };
}

function createEffectsState(overrides: Partial<Parameters<typeof usePopupRuntimeEffects>[0]> = {}) {
  return {
    isReady: true,
    microphoneDevices: [],
    webcamDevices: [],
    page: 'home',
    recordingState: {
      captureMode: null,
      captureSource: null,
      countdownEndsAt: null,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.IDLE,
      viewportPreset: null,
    },
    refreshMicrophones: vi.fn(async () => []),
    refreshWebcams: vi.fn(async () => []),
    selectedPresetId: 'preset-1',
    setIsStartPending: setIsStartPendingMock,
    setPage: setPageMock,
    setRecordingControlCapability: setRecordingControlCapabilityMock,
    setSelectedPresetId: setSelectedPresetIdMock,
    setStartError: setStartErrorMock,
    setVideoCaptureMode: setVideoCaptureModeMock,
    setVideoSettings: setVideoSettingsMock,
    videoCaptureMode: CaptureMode.TAB,
    videoSettings: {
      autoFadeDelay: 0,
      countdownSeconds: 3,
      diagnosticsEnabled: false,
      microphoneDeviceId: null,
      microphoneEnabled: true,
      openEditorAfterRecording: true,
      quality: VideoQuality.MEDIUM,
      systemAudioEnabled: true,
    },
    ...overrides,
  } satisfies Parameters<typeof usePopupRuntimeEffects>[0];
}

function EffectsHarness({ state }: { state: Parameters<typeof usePopupRuntimeEffects>[0] }) {
  usePopupRuntimeEffects(state);
  return null;
}
async function renderHarness(element: ReactElement) {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  setIsStartPendingMock = vi.fn();
  setPageMock = vi.fn();
  setRecordingControlCapabilityMock = vi.fn();
  setSelectedPresetIdMock = vi.fn();
  setStartErrorMock = vi.fn();
  setVideoCaptureModeMock = vi.fn();
  setVideoSettingsMock = vi.fn();
  loggerErrorMock.mockReset();
  persistVideoSettingsMock.mockReset();
  persistVideoUiStateMock.mockReset();
  toastErrorMock.mockReset();
  persistVideoSettingsMock.mockResolvedValue(undefined);
  persistVideoUiStateMock.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function verifyPersistenceFailures() {
  persistVideoSettingsMock.mockRejectedValueOnce(new Error('settings failed'));
  persistVideoUiStateMock.mockRejectedValueOnce(new Error('ui state failed'));

  await renderHarness(<EffectsHarness state={createEffectsState()} />);
  await flushMicrotasks();

  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to persist video settings',
    expect.any(Error)
  );
  expect(loggerErrorMock).toHaveBeenCalledWith(
    'Failed to persist video UI state',
    expect.any(Error)
  );
  expect(toastErrorMock).toHaveBeenCalledWith('common.states.error');
}

async function verifyRecordingActivationNavigation() {
  await renderHarness(
    <EffectsHarness
      state={createEffectsState({
        recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
      })}
    />
  );
  await flushMicrotasks();

  expect(setIsStartPendingMock).toHaveBeenCalledWith(false);
  expect(setStartErrorMock).toHaveBeenCalledWith(null);
  expect(setPageMock).toHaveBeenCalledWith('video');
}

async function verifyManualTabSelectionIsPreserved() {
  await renderHarness(
    <EffectsHarness
      state={createEffectsState({
        page: 'home',
        recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
      })}
    />
  );
  await flushMicrotasks();

  setPageMock.mockClear();

  await renderHarness(
    <EffectsHarness
      state={createEffectsState({
        page: 'export',
        recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
      })}
    />
  );
  await flushMicrotasks();

  expect(setPageMock).not.toHaveBeenCalled();
}

async function verifyIdleStateDoesNotForceHome() {
  await renderHarness(
    <EffectsHarness
      state={createEffectsState({
        recordingState: createRecordingState(VideoRecordingStatus.RECORDING),
      })}
    />
  );
  await flushMicrotasks();

  await renderHarness(<EffectsHarness state={createEffectsState()} />);
  await flushMicrotasks();

  expect(setPageMock).not.toHaveBeenCalledWith('home');
}

async function verifyPersistenceSkipsWhileNotReady() {
  await renderHarness(<EffectsHarness state={createEffectsState({ isReady: false })} />);
  await flushMicrotasks();

  expect(persistVideoSettingsMock).not.toHaveBeenCalled();
  expect(persistVideoUiStateMock).not.toHaveBeenCalled();
}

function runPopupRuntimeEffectsSuite() {
  it('logs persistence failures for video settings and UI state', verifyPersistenceFailures);
  it(
    'moves the popup to the video tab when recording becomes active',
    verifyRecordingActivationNavigation
  );
  it(
    'does not force the popup back to video after manual tab switching',
    verifyManualTabSelectionIsPreserved
  );
  it(
    'does not force the popup back home when recording returns to idle',
    verifyIdleStateDoesNotForceHome
  );
  it(
    'skips persistence effects while popup state is not ready',
    verifyPersistenceSkipsWhileNotReady
  );
}

describe('usePopupRuntimeEffects', runPopupRuntimeEffectsSuite);
