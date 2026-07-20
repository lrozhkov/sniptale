import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserRuntimeSubscribeToMessagesMock,
  loggerDebugMock,
  parseOffscreenRuntimeMessageMock,
  pauseRecordingMock,
  requestDesktopMediaMock,
  resumeRecordingMock,
  setViewportDrawStateMock,
  startRecordingMock,
  stopRecordingMock,
  updateViewportCropMock,
} = vi.hoisted(() => ({
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  pauseRecordingMock: vi.fn(),
  requestDesktopMediaMock: vi.fn(),
  resumeRecordingMock: vi.fn(),
  setViewportDrawStateMock: vi.fn(),
  startRecordingMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  updateViewportCropMock: vi.fn(),
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
  pauseRecording: pauseRecordingMock,
  resumeRecording: resumeRecordingMock,
  setViewportDrawState: setViewportDrawStateMock,
  startRecording: startRecordingMock,
  stopRecording: stopRecordingMock,
  updateViewportCrop: updateViewportCropMock,
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
    streamId: 'stream-1',
    settings,
    tabId: 7,
    viewport: { width: 1440, height: 900, devicePixelRatio: 2 },
    recordingId: 'recording-1',
    captureMode: CaptureMode.TAB,
    cropRegion: { x: 1, y: 2, width: 3, height: 4 },
    targetResolution: { width: 1920, height: 1080 },
    emulatedViewportCssSize: { width: 960, height: 540 },
  });
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_UPDATE_VIEWPORT_CROP,
    targetResolution: { width: 1920, height: 1080 },
    emulatedViewportCssSize: { width: 960, height: 540 },
  });
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_SET_VIEWPORT_DRAW_STATE,
    frozen: true,
    navigationEpoch: 12,
  });
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
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
    targetResolution: { width: 1920, height: 1080 },
    emulatedViewportCssSize: { width: 960, height: 540 },
  });
  expect(updateViewportCropMock).toHaveBeenCalledWith({
    targetResolution: { width: 1920, height: 1080 },
    viewportSizeInPixels: { width: 960, height: 540 },
  });
  expect(setViewportDrawStateMock).toHaveBeenCalledWith({
    frozen: true,
    navigationEpoch: 12,
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

  const { registerOffscreenRuntimeMessageListener } = await import('./index');
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

function resetOffscreenRuntimeMocks() {
  vi.clearAllMocks();
  vi.resetModules();
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
    streamId: 'stream-minimal',
    settings: createExportSettings(),
  });
  emitTrustedRuntimeMessage(listener, {
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
    discard: true,
  });
  await flushRuntimeRouting();

  expect(startRecordingMock).toHaveBeenCalledWith({
    settings: createExportSettings(),
    streamId: 'stream-minimal',
  });
  expect(stopRecordingMock).toHaveBeenCalledWith(true);
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
      streamId: 'stream-ack',
      settings: createExportSettings(),
    },
    sendResponse
  );

  expect(keepChannelOpen).toBe(false);
  expect(sendResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(startRecordingMock).toHaveBeenCalledOnce();
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
});
