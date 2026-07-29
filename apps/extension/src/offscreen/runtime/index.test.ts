import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserRuntimeSubscribeToMessagesMock,
  loggerDebugMock,
  parseOffscreenRuntimeMessageMock,
  pauseRecordingMock,
  requestDesktopMediaMock,
  resumeRecordingMock,
  startRecordingMock,
  stopRecordingMock,
} = vi.hoisted(() => ({
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  pauseRecordingMock: vi.fn(),
  requestDesktopMediaMock: vi.fn(),
  resumeRecordingMock: vi.fn(),
  startRecordingMock: vi.fn(),
  stopRecordingMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: browserRuntimeSubscribeToMessagesMock,
  },
}));

vi.mock('../../contracts/messaging/parsers/boundary', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../contracts/messaging/parsers/boundary')>()),
  parseOffscreenRuntimeMessage: parseOffscreenRuntimeMessageMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
  }),
}));

vi.mock('../recording/setup/desktop-media', () => ({
  consumeDesktopStream: vi.fn(),
  consumeDesktopStreams: vi.fn(),
  detachCachedPreview: vi.fn(),
  disposeMultiSourceDesktopMedia: vi.fn(),
  requestDesktopMedia: requestDesktopMediaMock,
}));

vi.mock('../recording/controller', () => ({
  activateViewportOutput: vi.fn(),
  pauseRecording: pauseRecordingMock,
  resumeRecording: resumeRecordingMock,
  setViewportDrawState: vi.fn(),
  startRecording: startRecordingMock,
  stopRecording: stopRecordingMock,
  updateRecordingSettings: vi.fn(),
}));

vi.mock('../project-export/index', () => ({
  cancelProjectExport: vi.fn(),
  getProjectExportCapabilities: vi.fn(),
  reconcileProjectExportJobs: vi.fn(),
  startProjectExport: vi.fn(),
}));
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { createExportSettings } from './test-support';
import { registerOffscreenRuntimeMessageListener } from './index';

type SubscriptionListener = (
  message: unknown,
  sender?: chrome.runtime.MessageSender,
  sendResponse?: (response?: unknown) => void
) => unknown;

const trustedBackgroundSender = {
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/service-worker-loader.js',
} as chrome.runtime.MessageSender;

function emitTrustedRuntimeMessage(
  listener: SubscriptionListener,
  message: { type: string } & Record<string, unknown>,
  sendResponse?: (response?: unknown) => void
): unknown {
  return listener(
    attachRuntimeMessageFreshness(attachOffscreenCommandCapability(message)),
    trustedBackgroundSender,
    sendResponse
  );
}

function emitValidatedRecordingMessages(
  listener: SubscriptionListener,
  settings: ReturnType<typeof createExportSettings>
) {
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.GET_DESKTOP_MEDIA,
    captureMode: CaptureMode.TAB,
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
    controlledCursorCaptureEnabled: true,
  });
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    generation: 1,
    streamId: 'stream-1',
    settings,
    tabId: 7,
    viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
    recordingId: 'recording-1',
    streamInstanceId: 'stream-instance-1',
    captureMode: CaptureMode.TAB,
    cropRegion: { x: 1, y: 2, width: 3, height: 4 },
  });
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
    recordingId: 'recording-1',
    generation: 1,
    streamInstanceId: 'stream-instance-1',
  });
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_PAUSE_RECORDING,
  });
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_RESUME_RECORDING,
  });
}

function expectValidatedRecordingRoutes(settings: ReturnType<typeof createExportSettings>) {
  expect(requestDesktopMediaMock).toHaveBeenCalledWith(CaptureMode.TAB, true, {
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
  });
  expect(startRecordingMock).toHaveBeenCalledWith({
    streamId: 'stream-1',
    settings,
    tabId: 7,
    viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
    recordingId: 'recording-1',
    captureMode: CaptureMode.TAB,
    cropRegion: { x: 1, y: 2, width: 3, height: 4 },
    generation: 1,
    streamInstanceId: 'stream-instance-1',
  });
  expect(stopRecordingMock).toHaveBeenCalledOnce();
  expect(pauseRecordingMock).toHaveBeenCalledOnce();
  expect(resumeRecordingMock).toHaveBeenCalledOnce();
}

async function captureSubscriptionListener(): Promise<SubscriptionListener> {
  let listener: SubscriptionListener | undefined;
  browserRuntimeSubscribeToMessagesMock.mockImplementation((callback: SubscriptionListener) => {
    listener = callback;
    return vi.fn();
  });

  registerOffscreenRuntimeMessageListener();

  if (!listener) {
    throw new Error('Expected offscreen runtime subscription listener');
  }

  return listener;
}

async function flushRuntimeRouting() {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function resetOffscreenRuntimeMocks() {
  vi.clearAllMocks();
  requestDesktopMediaMock.mockResolvedValue(undefined);
  startRecordingMock.mockResolvedValue(undefined);
  stopRecordingMock.mockResolvedValue(undefined);
}

async function verifiesValidatedMessageRouting() {
  const listener = await captureSubscriptionListener();
  const settings = createExportSettings();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);

  emitValidatedRecordingMessages(listener, settings);
  await flushRuntimeRouting();

  expectValidatedRecordingRoutes(settings);
}

async function verifiesInvalidParseIgnored() {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation(() => {
    throw new Error('invalid payload');
  });

  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
  });
  await flushRuntimeRouting();

  expect(requestDesktopMediaMock).not.toHaveBeenCalled();
  expect(startRecordingMock).not.toHaveBeenCalled();
  expect(loggerDebugMock).toHaveBeenCalledWith(
    'Ignored invalid offscreen runtime message',
    expect.objectContaining({
      errorMessage: 'invalid payload',
    })
  );
}

async function verifiesOptionalRuntimeFieldsStayOmittedWhenAbsent() {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);

  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_START_RECORDING,
    generation: 1,
    recordingId: 'recording-minimal',
    streamId: 'stream-minimal',
    streamInstanceId: 'stream-instance-minimal',
    settings: createExportSettings(),
  });
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
    discard: true,
    generation: 1,
    recordingId: 'recording-minimal',
    streamInstanceId: 'stream-instance-minimal',
  });
  await flushRuntimeRouting();

  expect(startRecordingMock).toHaveBeenCalledWith({
    generation: 1,
    recordingId: 'recording-minimal',
    settings: createExportSettings(),
    streamId: 'stream-minimal',
    streamInstanceId: 'stream-instance-minimal',
  });
  expect(stopRecordingMock).toHaveBeenCalledWith(
    {
      generation: 1,
      recordingId: 'recording-minimal',
      streamInstanceId: 'stream-instance-minimal',
    },
    true
  );
}

async function verifiesStartRecordingAcknowledgesAcceptedCommandImmediately() {
  const listener = await captureSubscriptionListener();
  const sendResponse = vi.fn();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  startRecordingMock.mockReturnValueOnce(new Promise(() => undefined));

  const keepChannelOpen = emitTrustedRuntimeMessage(
    listener,
    {
      type: VideoMessageType.OFFSCREEN_START_RECORDING,
      generation: 1,
      recordingId: 'recording-ack',
      streamId: 'stream-ack',
      streamInstanceId: 'stream-instance-ack',
      settings: createExportSettings(),
    },
    sendResponse
  );

  expect(keepChannelOpen).toBe(false);
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(startRecordingMock).toHaveBeenCalledOnce();
}

async function verifiesDuplicateBoundStopsShareOneDeferredOutcome() {
  const listener = await captureSubscriptionListener();
  const firstResponse = vi.fn();
  const duplicateResponse = vi.fn();
  const stop = createDeferred<{ result: 'stopped' }>();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  stopRecordingMock.mockReturnValueOnce(stop.promise);
  const command = attachOffscreenCommandCapability({
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
    generation: 7,
    recordingId: 'recording-duplicate-stop',
    streamInstanceId: 'stream-duplicate-stop',
  });
  const emitStop = (nonce: string, response: (value?: unknown) => void) =>
    listener(
      attachRuntimeMessageFreshness(command, {
        issuedAtEpochMs: Date.now(),
        nonce,
      }),
      trustedBackgroundSender,
      response
    );

  expect(emitStop('duplicate-stop-first', firstResponse)).toBe(true);
  expect(emitStop('duplicate-stop-second', duplicateResponse)).toBe(true);
  expect(stopRecordingMock).toHaveBeenCalledOnce();

  stop.resolve({ result: 'stopped' });
  await flushRuntimeRouting();

  expect(firstResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(duplicateResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
}

async function verifiesTerminalStopFailuresUseAnAcceptedTerminalResponse() {
  const listener = await captureSubscriptionListener();
  const sendResponse = vi.fn();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  stopRecordingMock.mockResolvedValueOnce({
    error: 'encoder failed',
    result: 'terminal-failure',
  });

  expect(
    emitTrustedRuntimeMessage(
      listener,
      {
        type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
        generation: 8,
        recordingId: 'recording-terminal-stop',
        streamInstanceId: 'stream-terminal-stop',
      },
      sendResponse
    )
  ).toBe(true);
  await flushRuntimeRouting();

  expect(sendResponse).toHaveBeenCalledWith({
    success: true,
    result: 'terminal-failure',
    error: 'encoder failed',
  });
}

describe('offscreen-runtime', () => {
  beforeEach(resetOffscreenRuntimeMocks);
  it('ignores payloads that fail runtime message parsing', verifiesInvalidParseIgnored);
  it(
    'routes validated runtime messages to the owning offscreen handlers',
    verifiesValidatedMessageRouting
  );
  it(
    'omits absent optional fields and forwards explicit discard flags',
    verifiesOptionalRuntimeFieldsStayOmittedWhenAbsent
  );
  it(
    'acknowledges accepted start-recording commands before async media setup completes',
    verifiesStartRecordingAcknowledgesAcceptedCommandImmediately
  );
  it(
    'shares one deferred result with duplicate identity-bound stop commands',
    verifiesDuplicateBoundStopsShareOneDeferredOutcome
  );
  it(
    'acknowledges terminal recorder failures as one terminal stop result',
    verifiesTerminalStopFailuresUseAnAcceptedTerminalResponse
  );
});
