import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { startRecordingHandler } from './start-recording';
import { DEFAULT_VIDEO_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';

const { openCameraRecorderPage, requestMicrophonePermission, requestWebcamPermission } = vi.hoisted(
  () => ({
    openCameraRecorderPage: vi.fn(),
    requestMicrophonePermission: vi.fn(),
    requestWebcamPermission: vi.fn(),
  })
);

vi.mock('../../recording/microphone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/microphone')>()),
  requestMicrophonePermission,
}));

vi.mock('../../recording/webcam', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../recording/webcam')>()),
  requestWebcamPermission,
}));

vi.mock('../../../platform/navigation/extension-pages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/navigation/extension-pages')>()),
  openCameraRecorderPage,
}));

const defaultSettings = {
  ...DEFAULT_VIDEO_SETTINGS,
  microphoneEnabled: false,
  microphoneDeviceId: null,
  webcamEnabled: false,
  webcamDeviceId: null,
  systemAudioEnabled: true,
  countdownSeconds: 3,
  autoFadeDelay: 3,
  diagnosticsEnabled: false,
  controlledCursorCaptureEnabled: false,
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

function buildStartMessage(captureMode: CaptureMode, viewportPresetId: string | null = 'hd') {
  return {
    type: VideoMessageType.START_RECORDING,
    settings: {
      ...defaultSettings,
      controlledCursorCaptureEnabled: false,
      sourceCount: 1,
    },
    tabId: 123,
    captureMode,
    viewportPresetId,
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
    microphoneDevices: [],
    viewportPresetId: 'hd',
    webcamDevices: [],
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
      captureMode: CaptureMode.TAB,
    })
  );

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining(buildStartMessage(CaptureMode.TAB))
  );
}

async function verifiesMissingPresetEarlyReturn() {
  await startRecordingHandler(
    createStartArgs({
      captureMode: CaptureMode.TAB,
      viewportPresetId: null,
    })
  );

  expect(runtimeSendMessage).toHaveBeenCalledWith(
    expect.objectContaining(buildStartMessage(CaptureMode.TAB, null))
  );
  expect(setStartError).not.toHaveBeenCalled();
}

async function verifiesMicrophonePermissionRequest() {
  await startRecordingHandler(
    createStartArgs({
      microphoneDevices: [{ deviceId: 'mic-1', label: 'Microphone 1' }],
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
    expect.objectContaining(buildStartMessage(CaptureMode.SCREEN, null))
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

  it('sends the selected preset ID for tab recording', verifiesTabModeMessage);
  it('keeps the selected preset ID in the recording draft message', verifiesViewportPresetMessage);
  it('uses the current size when no preset is selected', verifiesMissingPresetEarlyReturn);
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
