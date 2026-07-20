// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { usePopupRuntime } from './index';
import {
  createPopupRuntimeStateSlice,
  createRuntimeRecordingState,
  type PopupRuntimeStateSliceOverrides,
} from './test-support/state';

const {
  loggerErrorMock,
  sendRuntimeMessageMock,
  startRecordingHandlerMock,
  toggleMicrophoneMock,
  usePopupLifecycleEffectMock,
  usePopupRuntimeStateMock,
  useAppLocaleMock,
} = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startRecordingHandlerMock: vi.fn(),
  toggleMicrophoneMock: vi.fn(),
  usePopupLifecycleEffectMock: vi.fn(),
  usePopupRuntimeStateMock: vi.fn(),
  useAppLocaleMock: vi.fn(),
}));

vi.mock('../../../platform/runtime-messaging', (_importOriginal) => ({
  createRuntimeMessagingTransport: () => ({ sendRuntimeMessage: sendRuntimeMessageMock }),
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  sendRuntimeMessage: sendRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', (_importOriginal) => ({
  createLogger: () => ({
    child: () => {
      throw new Error('Logger child() is not expected in popup runtime tests');
    },
    debug: vi.fn(),
    error: loggerErrorMock,
    info: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  }),
}));

vi.mock('./start-recording', (_importOriginal) => ({
  startRecordingHandler: startRecordingHandlerMock,
}));

vi.mock('../../recording/microphone-flow', (_importOriginal) => ({
  toggleMicrophone: toggleMicrophoneMock,
}));

vi.mock('../lifecycle/effect', (_importOriginal) => ({
  usePopupLifecycleEffect: usePopupLifecycleEffectMock,
}));

vi.mock('./state', (_importOriginal) => ({
  usePopupRuntimeState: usePopupRuntimeStateMock,
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: useAppLocaleMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestRuntime: ReturnType<typeof usePopupRuntime> | null = null;
const recordingControlCapability = {
  controlToken: 'control-token-1',
  recordingId: 'recording-1',
};

function createRuntimeState(overrides: PopupRuntimeStateSliceOverrides = {}) {
  return createPopupRuntimeStateSlice({
    recordingControlCapability,
    ...overrides,
  });
}

function HookHarness() {
  latestRuntime = usePopupRuntime();
  return null;
}

async function renderHarness() {
  if (!container) {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<HookHarness />);
  });
}

async function invokePauseResumeWithStatus(status: VideoRecordingStatus) {
  usePopupRuntimeStateMock.mockReturnValueOnce(
    createRuntimeState({
      recordingState: createRuntimeRecordingState(status),
    })
  );

  await renderHarness();
  await act(async () => {
    await latestRuntime?.recording.handlePauseResume();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestRuntime = null;
  loggerErrorMock.mockReset();
  sendRuntimeMessageMock.mockReset();
  sendRuntimeMessageMock.mockResolvedValue(undefined);
  startRecordingHandlerMock.mockReset();
  toggleMicrophoneMock.mockReset();
  usePopupLifecycleEffectMock.mockReset();
  usePopupRuntimeStateMock.mockReset();
  useAppLocaleMock.mockReset();
  usePopupRuntimeStateMock.mockReturnValue(createRuntimeState());
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('sends pause and resume runtime messages based on the recording status', async () => {
  await invokePauseResumeWithStatus(VideoRecordingStatus.RECORDING);

  expect(useAppLocaleMock).toHaveBeenCalled();
  expect(usePopupLifecycleEffectMock).toHaveBeenCalledWith(expect.any(Function));
  expect(latestRuntime).toEqual(
    expect.objectContaining({
      environment: expect.objectContaining({
        galleryStatus: null,
      }),
      navigation: expect.objectContaining({
        isReady: true,
        page: 'home',
      }),
      recording: expect.objectContaining({
        handlePauseResume: expect.any(Function),
        handleStop: expect.any(Function),
        handleToggleMicrophone: expect.any(Function),
        recordingState: expect.objectContaining({
          status: VideoRecordingStatus.RECORDING,
        }),
      }),
    })
  );

  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(1, {
    ...recordingControlCapability,
    type: VideoMessageType.PAUSE_RECORDING,
  });

  await invokePauseResumeWithStatus(VideoRecordingStatus.PAUSED);

  expect(sendRuntimeMessageMock).toHaveBeenNthCalledWith(2, {
    ...recordingControlCapability,
    type: VideoMessageType.RESUME_RECORDING,
  });
});

it('exposes lifecycle clearing for applied viewport authority', async () => {
  const setAppliedViewportPresetId = vi.fn();
  const setAppliedViewportTabId = vi.fn();
  usePopupRuntimeStateMock.mockReturnValueOnce(
    createRuntimeState({
      setAppliedViewportPresetId,
      setAppliedViewportTabId,
    })
  );

  await renderHarness();
  const lifecycleParams = usePopupLifecycleEffectMock.mock.calls[0]?.[0]?.();
  lifecycleParams.clearAppliedViewportAuthority();

  expect(setAppliedViewportPresetId).toHaveBeenCalledWith(null);
  expect(setAppliedViewportTabId).toHaveBeenCalledWith(null);
});

it('logs pause state failures through the popup runtime logger', async () => {
  const error = new Error('pause failed');
  sendRuntimeMessageMock.mockRejectedValueOnce(error);

  await renderHarness();
  await act(async () => {
    await latestRuntime?.recording.handlePauseResume();
  });

  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to change pause state', error);
});

it('logs stop failures through the popup runtime logger', async () => {
  const error = new Error('stop failed');
  sendRuntimeMessageMock.mockRejectedValueOnce(error);

  await renderHarness();
  await act(async () => {
    await latestRuntime?.recording.handleStop();
  });

  expect(loggerErrorMock).toHaveBeenCalledWith('Failed to stop recording', error);
});

it('sends discard stop messages through the shared stop handler', async () => {
  await renderHarness();
  await act(async () => {
    await latestRuntime?.recording.handleStop({ discard: true });
  });

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    ...recordingControlCapability,
    discard: true,
    type: VideoMessageType.STOP_RECORDING,
  });
});

it('delegates microphone toggles through the popup microphone flow', async () => {
  await renderHarness();

  act(() => {
    latestRuntime?.recording.handleToggleMicrophone();
  });

  expect(toggleMicrophoneMock).toHaveBeenCalledWith(
    expect.objectContaining({
      refreshMicrophones: expect.any(Function),
      setStartError: expect.any(Function),
      setVideoSettings: expect.any(Function),
      videoSettings: expect.objectContaining({
        microphoneDeviceId: 'mic-1',
      }),
    })
  );
});
