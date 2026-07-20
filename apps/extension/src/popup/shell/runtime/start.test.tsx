// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CaptureMode, VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
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
      throw new Error('Logger child() is not expected in popup runtime start tests');
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

vi.mock('../../../platform/i18n', (_importOriginal) => ({
  useAppLocale: useAppLocaleMock,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestRuntime: ReturnType<typeof usePopupRuntime> | null = null;

function createRuntimeState(overrides: PopupRuntimeStateSliceOverrides = {}) {
  return createPopupRuntimeStateSlice(overrides);
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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  latestRuntime = null;
  loggerErrorMock.mockReset();
  sendRuntimeMessageMock.mockReset();
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

describe('usePopupRuntime successful start recording', () => {
  it('starts recording only from the idle state when no start is pending', async () => {
    const clearStartError = vi.fn();
    const setIsStartPending = vi.fn();
    const setStartError = vi.fn();

    usePopupRuntimeStateMock.mockReturnValueOnce(
      createRuntimeState({
        clearStartError,
        isStartPending: false,
        recordingState: createRuntimeRecordingState(VideoRecordingStatus.IDLE),
        selectedPreset: { id: 'preset-1', height: 720, label: 'Preset', width: 1280 },
        setIsStartPending,
        setStartError,
      })
    );

    await renderHarness();
    await act(async () => {
      await latestRuntime?.recording.handleStartRecording();
    });

    expect(useAppLocaleMock).toHaveBeenCalled();
    expect(usePopupLifecycleEffectMock).toHaveBeenCalledWith(expect.any(Function));
    expect(clearStartError).toHaveBeenCalledOnce();
    expect(startRecordingHandlerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMode: CaptureMode.TAB,
        setIsStartPending,
        setStartError,
        viewportPreset: null,
      })
    );
  });
});

describe('usePopupRuntime blocked start recording', () => {
  it('skips start recording while a previous start is pending', async () => {
    usePopupRuntimeStateMock.mockReturnValueOnce(
      createRuntimeState({
        isStartPending: true,
        recordingState: createRuntimeRecordingState(VideoRecordingStatus.IDLE),
      })
    );

    await renderHarness();
    await act(async () => {
      await latestRuntime?.recording.handleStartRecording();
    });

    expect(startRecordingHandlerMock).not.toHaveBeenCalled();
  });

  it('skips start recording when the runtime is not idle', async () => {
    usePopupRuntimeStateMock.mockReturnValueOnce(
      createRuntimeState({
        isStartPending: false,
        recordingState: createRuntimeRecordingState(VideoRecordingStatus.RECORDING),
      })
    );

    await renderHarness();
    await act(async () => {
      await latestRuntime?.recording.handleStartRecording();
    });

    expect(startRecordingHandlerMock).not.toHaveBeenCalled();
  });
});
