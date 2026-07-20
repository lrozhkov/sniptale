import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const {
  browserRuntimeSubscribeToMessagesMock,
  cancelProjectExportMock,
  parseOffscreenRuntimeMessageMock,
  pauseRecordingMock,
  requestDesktopMediaMock,
  resumeRecordingMock,
  setViewportDrawStateMock,
  startProjectExportMock,
  startRecordingMock,
  stopRecordingMock,
  updateViewportCropMock,
} = vi.hoisted(() => ({
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  cancelProjectExportMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  pauseRecordingMock: vi.fn(),
  requestDesktopMediaMock: vi.fn(),
  resumeRecordingMock: vi.fn(),
  setViewportDrawStateMock: vi.fn(),
  startProjectExportMock: vi.fn(),
  startRecordingMock: vi.fn(),
  stopRecordingMock: vi.fn(),
  updateViewportCropMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', () => ({
  BrowserRuntimeAdapter: undefined,
  RuntimeInfoAdapter: undefined,
  browserRuntime: {
    subscribeToMessages: browserRuntimeSubscribeToMessagesMock,
  },
  runtimeInfo: {},
}));

vi.mock('../../contracts/messaging/parsers/boundary', () => ({
  parseBackgroundRuntimeMessage: vi.fn(),
  parseContentTabMessage: vi.fn(),
  parseOffscreenRuntimeMessage: parseOffscreenRuntimeMessageMock,
  parsePopupRuntimeMessage: vi.fn(),
  parseRuntimeRequestMessage: vi.fn(),
  parseRuntimeResponseForMessage: vi.fn(),
  parseRuntimeResponseForRequest: vi.fn(),
  parseTabRequestMessage: vi.fn(),
  parseTabResponseForMessage: vi.fn(),
  parseTabResponseForRequest: vi.fn(),
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
  cancelProjectExport: cancelProjectExportMock,
  getProjectExportCapabilities: vi.fn(),
  reconcileProjectExportJobs: vi.fn(),
  startProjectExport: startProjectExportMock,
}));

type SubscriptionListener = (
  message: unknown,
  sender?: chrome.runtime.MessageSender,
  sendResponse?: (response?: unknown) => void
) => unknown;
const ambiguousSameExtensionSender = { id: 'sniptale-extension' } as chrome.runtime.MessageSender;
const generatedBackgroundSender = {
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/service-worker-loader.js',
  origin: 'chrome-extension://sniptale-extension',
  documentId: 'background-document',
  frameId: 0,
} as chrome.runtime.MessageSender;
const moduleBackgroundSender = {
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/apps/extension/src/background/index.js',
  origin: 'chrome-extension://sniptale-extension',
  documentId: 'background-module',
  frameId: 0,
} as chrome.runtime.MessageSender;
const contentTabSender = {
  id: 'sniptale-extension',
  tab: { id: 7 },
  url: 'https://example.test/page',
} as chrome.runtime.MessageSender;
const extensionPageSender = {
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/settings/index.html',
} as chrome.runtime.MessageSender;
const offscreenPageSender = {
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/apps/extension/src/offscreen/offscreen.html',
  origin: 'chrome-extension://sniptale-extension',
  documentId: 'offscreen-document',
  frameId: 0,
} as chrome.runtime.MessageSender;

async function flushRuntimeRouting() {
  await Promise.resolve();
  await Promise.resolve();
}

function createAuthorizedOffscreenMessage<TMessage extends { type: string }>(
  message: TMessage,
  nonce: string
) {
  return attachRuntimeMessageFreshness(attachOffscreenCommandCapability(message), {
    issuedAtEpochMs: Date.now(),
    nonce,
  });
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

function resetBoundaryMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  requestDesktopMediaMock.mockResolvedValue(undefined);
  startRecordingMock.mockResolvedValue(undefined);
}

async function verifiesValidNonOffscreenMessagesIgnored() {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);

  listener({ type: MessageType.EXPORT_CAPTURE_FULL_PAGE }, generatedBackgroundSender);
  await flushRuntimeRouting();

  expect(requestDesktopMediaMock).not.toHaveBeenCalled();
  expect(startRecordingMock).not.toHaveBeenCalled();
  expect(updateViewportCropMock).not.toHaveBeenCalled();
  expect(setViewportDrawStateMock).not.toHaveBeenCalled();
  expect(stopRecordingMock).not.toHaveBeenCalled();
  expect(pauseRecordingMock).not.toHaveBeenCalled();
  expect(resumeRecordingMock).not.toHaveBeenCalled();
  expect(startProjectExportMock).not.toHaveBeenCalled();
  expect(cancelProjectExportMock).not.toHaveBeenCalled();
}

function emitUnauthorizedOffscreenMessages(
  listener: SubscriptionListener,
  sendResponse: (response?: unknown) => void
) {
  return [
    listener(
      {
        type: 'OFFSCREEN_START_RECORDING',
        streamId: 'stream-content',
        settings: {},
      },
      contentTabSender,
      sendResponse
    ),
    listener(
      { type: VideoMessageType.OFFSCREEN_STOP_RECORDING },
      extensionPageSender,
      sendResponse
    ),
    listener(
      {
        type: VideoMessageType.GET_DESKTOP_MEDIA,
        captureMode: CaptureMode.SCREEN,
        desktopMediaRequestGeneration: 'generation-1',
        desktopMediaRequestId: 'request-1',
      },
      offscreenPageSender,
      sendResponse
    ),
    listener(
      { type: VideoMessageType.OFFSCREEN_STOP_RECORDING },
      ambiguousSameExtensionSender,
      sendResponse
    ),
  ];
}

async function verifiesUnauthorizedSendersCannotInvokeOffscreenHandlers() {
  const listener = await captureSubscriptionListener();
  const sendResponse = vi.fn();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);

  const routeReturns = emitUnauthorizedOffscreenMessages(listener, sendResponse);
  await flushRuntimeRouting();

  expect(routeReturns).toEqual([false, false, false, false]);
  expect(sendResponse).toHaveBeenCalledTimes(4);
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Unauthorized offscreen command sender',
  });
  expect(startRecordingMock).not.toHaveBeenCalled();
  expect(requestDesktopMediaMock).not.toHaveBeenCalled();
  expect(stopRecordingMock).not.toHaveBeenCalled();
}

async function verifiesTrustedBackgroundSenderVariantsCanInvokeOffscreenHandlers() {
  const listener = await captureSubscriptionListener();
  const desktopMediaResponse = vi.fn();
  const startRecordingResponse = vi.fn();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);

  const desktopMediaReturn = listener(
    createAuthorizedOffscreenMessage(
      {
        type: VideoMessageType.GET_DESKTOP_MEDIA,
        captureMode: CaptureMode.SCREEN,
        desktopMediaRequestGeneration: 'generation-1',
        desktopMediaRequestId: 'request-1',
      },
      'desktop-media-nonce'
    ),
    generatedBackgroundSender,
    desktopMediaResponse
  );
  const startRecordingReturn = listener(
    createAuthorizedOffscreenMessage(
      {
        type: VideoMessageType.OFFSCREEN_START_RECORDING,
        streamId: 'stream-background',
        settings: {},
      },
      'start-recording-nonce'
    ),
    moduleBackgroundSender,
    startRecordingResponse
  );
  await flushRuntimeRouting();

  expect(desktopMediaReturn).toBe(true);
  expect(startRecordingReturn).toBe(false);
  expect(requestDesktopMediaMock).toHaveBeenCalledWith(CaptureMode.SCREEN, false, {
    desktopMediaRequestGeneration: 'generation-1',
    desktopMediaRequestId: 'request-1',
  });
  expect(startRecordingMock).toHaveBeenCalledWith({
    settings: {},
    streamId: 'stream-background',
  });
  expect(desktopMediaResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
  expect(startRecordingResponse).toHaveBeenCalledWith({ success: true, result: 'accepted' });
}

describe('offscreen-runtime boundaries', () => {
  beforeEach(resetBoundaryMocks);
  it(
    'ignores validated runtime messages outside the offscreen command seam',
    verifiesValidNonOffscreenMessagesIgnored
  );
  it(
    'rejects content and extension-page senders before invoking offscreen handlers',
    verifiesUnauthorizedSendersCannotInvokeOffscreenHandlers
  );
  it(
    'accepts trusted background sender variants with extension document metadata',
    verifiesTrustedBackgroundSenderVariantsCanInvokeOffscreenHandlers
  );
});
