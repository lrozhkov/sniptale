import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode, VideoQuality } from '@sniptale/runtime-contracts/video/types/types';
import { startRecordingHandler } from './start-recording';

const { openCameraRecorderPage, requestMicrophonePermission, requestWebcamPermission } = vi.hoisted(
  () => ({
    openCameraRecorderPage: vi.fn(),
    requestMicrophonePermission: vi.fn(),
    requestWebcamPermission: vi.fn(),
  })
);

vi.mock('../../recording/microphone', (_importOriginal) => ({
  requestMicrophonePermission,
}));

vi.mock('../../recording/webcam', (_importOriginal) => ({
  requestWebcamPermission,
}));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openCameraRecorderPage,
}));

const defaultSettings = {
  microphoneEnabled: false,
  microphoneDeviceId: null,
  webcamEnabled: false,
  webcamDeviceId: null,
  systemAudioEnabled: true,
  quality: VideoQuality.HIGH,
  countdownSeconds: 3,
  autoFadeDelay: 3,
  openEditorAfterRecording: false,
  diagnosticsEnabled: false,
  controlledCursorCaptureEnabled: false,
};

const viewportPreset = {
  id: 'hd',
  label: 'HD',
  width: 1920,
  height: 1080,
};

const setIsStartPending = vi.fn();
const setRecordingControlCapability = vi.fn();
const setStartError = vi.fn();
const tabsQuery = vi.fn();
const runtimeSendMessage = vi.fn();

function installChromeMocks() {
  tabsQuery.mockResolvedValue([{ id: 123 }]);
  runtimeSendMessage.mockResolvedValue({
    success: true,
    result: 'accepted',
    recordingId: 'recording-1',
    controlToken: 'control-token-1',
    cameraLaunchToken: 'launch-token-1',
  });
  openCameraRecorderPage.mockResolvedValue(undefined);

  Object.assign(globalThis, {
    chrome: {
      runtime: {
        sendMessage: runtimeSendMessage,
      },
      tabs: {
        query: tabsQuery,
      },
    },
  });
}

function buildStartMessage(captureMode: CaptureMode, nextViewportPreset?: typeof viewportPreset) {
  return {
    type: VideoMessageType.START_RECORDING,
    settings: {
      ...defaultSettings,
      controlledCursorCaptureEnabled: false,
      sourceCount: 1,
    },
    tabId: 123,
    captureMode,
    ...(nextViewportPreset ? { viewportPreset: nextViewportPreset } : {}),
  };
}

function resetStartRecordingMocks() {
  vi.clearAllMocks();
  installChromeMocks();
}

function createStartArgs(
  overrides: Partial<Parameters<typeof startRecordingHandler>[0]> = {}
): Parameters<typeof startRecordingHandler>[0] {
  return {
    videoSettings: defaultSettings,
    captureMode: CaptureMode.TAB,
    viewportPreset,
    setIsStartPending,
    setRecordingControlCapability,
    setStartError,
    ...overrides,
  };
}

async function verifiesTabModeMessage() {
  await startRecordingHandler(createStartArgs());

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining(buildStartMessage(CaptureMode.TAB))
  );
}

async function verifiesViewportPresetMessage() {
  await startRecordingHandler(
    createStartArgs({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
    })
  );

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining(buildStartMessage(CaptureMode.TAB))
  );
}

async function verifiesMissingPresetEarlyReturn() {
  await startRecordingHandler(
    createStartArgs({
      captureMode: CaptureMode.VIEWPORT_EMULATION,
      viewportPreset: null,
    })
  );

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining(buildStartMessage(CaptureMode.TAB))
  );
  expect(setStartError).not.toHaveBeenCalled();
}

async function verifiesMicrophonePermissionRequest() {
  await startRecordingHandler(
    createStartArgs({
      videoSettings: {
        ...defaultSettings,
        microphoneEnabled: true,
        microphoneDeviceId: 'mic-1',
      },
    })
  );

  expect(requestMicrophonePermission).toHaveBeenCalledWith('mic-1');
}

async function verifiesStartFailures() {
  tabsQuery.mockResolvedValueOnce([]);

  await startRecordingHandler(createStartArgs());

  runtimeSendMessage.mockResolvedValueOnce({
    success: false,
    error: 'runtime failed',
  });

  await startRecordingHandler(createStartArgs());

  expect(setStartError).toHaveBeenCalledWith(expect.stringContaining('runtime failed'));
  expect(setIsStartPending).toHaveBeenCalledWith(false);
}

async function verifiesStaleRuntimeFailureHint() {
  runtimeSendMessage.mockResolvedValueOnce({
    success: false,
    error: 'Could not establish connection. Receiving end does not exist.',
  });

  await startRecordingHandler(createStartArgs());

  expect(setStartError).toHaveBeenCalledWith(
    'Страница использует устаревшую версию расширения. Обновите страницу и повторите действие.'
  );
}

async function verifiesThrownRuntimeFailure() {
  runtimeSendMessage.mockRejectedValueOnce(new Error('runtime exploded'));

  await startRecordingHandler(createStartArgs());

  expect(setIsStartPending).toHaveBeenCalledWith(false);
  expect(setStartError).toHaveBeenCalledWith('runtime exploded');
}

async function verifiesCancelledStartClearsPendingWithInlineStatus() {
  runtimeSendMessage.mockResolvedValueOnce({
    success: true,
    result: 'cancelled',
  });

  await startRecordingHandler(createStartArgs());

  expect(setIsStartPending).toHaveBeenCalledWith(true);
  expect(setIsStartPending).toHaveBeenCalledWith(false);
  expect(setStartError).toHaveBeenCalledWith('Запуск записи отменён');
}

async function verifiesControlledCursorSanitization() {
  await startRecordingHandler(
    createStartArgs({
      videoSettings: {
        ...defaultSettings,
        controlledCursorCaptureEnabled: true,
      },
      captureMode: CaptureMode.SCREEN,
    })
  );

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining(buildStartMessage(CaptureMode.SCREEN))
  );
  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({
        controlledCursorCaptureEnabled: false,
      }),
    })
  );
}

async function verifiesControlledCursorPreservedForTabCapture() {
  await startRecordingHandler(
    createStartArgs({
      videoSettings: {
        ...defaultSettings,
        controlledCursorCaptureEnabled: true,
      },
    })
  );

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining({
      settings: expect.objectContaining({
        controlledCursorCaptureEnabled: false,
      }),
    })
  );
}

function runStartRecordingHandlerSuite() {
  beforeEach(resetStartRecordingMocks);

  it('does not send a viewport preset outside VIEWPORT_EMULATION mode', verifiesTabModeMessage);
  it('normalizes legacy viewport emulation mode to tab recording', verifiesViewportPresetMessage);
  it(
    'does not require a preset for legacy viewport emulation mode',
    verifiesMissingPresetEarlyReturn
  );
  it(
    'requests microphone permission when microphone recording is enabled',
    verifiesMicrophonePermissionRequest
  );
  it('reports a missing active tab and runtime failures', verifiesStartFailures);
  it('normalizes stale runtime failures into a refresh hint', verifiesStaleRuntimeFailureHint);
  it(
    'surfaces thrown runtime failures through the generic runtime error path',
    verifiesThrownRuntimeFailure
  );
  it(
    'clears pending state and shows inline status when recording start is cancelled',
    verifiesCancelledStartClearsPendingWithInlineStatus
  );
  it('sanitizes cursor-track recording for screen mode', verifiesControlledCursorSanitization);
  it(
    'sanitizes controlled cursor capture for tab recording too',
    verifiesControlledCursorPreservedForTabCapture
  );
}

describe('startRecordingHandler', runStartRecordingHandlerSuite);
