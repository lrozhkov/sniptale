import { beforeEach, expect, it, vi } from 'vitest';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { OFFSCREEN_COMMAND_RATE_LIMIT_MAX_FOR_TESTS } from './rate-limit';

const {
  browserRuntimeSubscribeToMessagesMock,
  parseOffscreenRuntimeMessageMock,
  stopRecordingMock,
} = vi.hoisted(() => ({
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  stopRecordingMock: vi.fn(),
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
  requestDesktopMedia: vi.fn(),
}));

vi.mock('../recording/controller', () => ({
  pauseRecording: vi.fn(),
  resumeRecording: vi.fn(),
  setViewportDrawState: vi.fn(),
  startRecording: vi.fn(),
  stopRecording: stopRecordingMock,
  updateViewportCrop: vi.fn(),
}));

vi.mock('../project-export/index', () => ({
  cancelProjectExport: vi.fn(),
  getProjectExportCapabilities: vi.fn(),
  reconcileProjectExportJobs: vi.fn(),
  startProjectExport: vi.fn(),
}));

type SubscriptionListener = (
  message: unknown,
  sender?: chrome.runtime.MessageSender,
  sendResponse?: (response?: unknown) => void
) => unknown;

const generatedBackgroundSender = {
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/service-worker-loader.js',
  origin: 'chrome-extension://sniptale-extension',
  documentId: 'background-document',
  frameId: 0,
} as chrome.runtime.MessageSender;
let freshnessNonceSequence = 0;

function createStopCommand() {
  return {
    type: VideoMessageType.OFFSCREEN_STOP_RECORDING,
    discard: true,
  };
}

function createAuthorizedOffscreenMessage<TMessage extends { type: string }>(
  message: TMessage,
  nowEpochMs = Date.now()
) {
  freshnessNonceSequence += 1;
  return attachRuntimeMessageFreshness(attachOffscreenCommandCapability(message, nowEpochMs), {
    issuedAtEpochMs: nowEpochMs,
    nonce: `offscreen-authorization-nonce-${freshnessNonceSequence}`,
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

async function flushRuntimeRouting() {
  await Promise.resolve();
  await Promise.resolve();
}

function expectPreParseFailure(
  sendResponse: ReturnType<typeof vi.fn>,
  error: string,
  routeReturn: unknown
) {
  expect(routeReturn).toBe(false);
  expect(sendResponse).toHaveBeenCalledWith({ success: false, error });
  expect(parseOffscreenRuntimeMessageMock).not.toHaveBeenCalled();
  expect(stopRecordingMock).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  freshnessNonceSequence = 0;
  stopRecordingMock.mockResolvedValue(undefined);
});

it('rejects missing command capability before parsing', async () => {
  const listener = await captureSubscriptionListener();
  const sendResponse = vi.fn();
  const routeReturn = listener(
    attachRuntimeMessageFreshness(createStopCommand()),
    generatedBackgroundSender,
    sendResponse
  );

  await flushRuntimeRouting();

  expectPreParseFailure(sendResponse, 'Missing offscreen command capability', routeReturn);
});

it('rejects tampered command capability before parsing', async () => {
  const listener = await captureSubscriptionListener();
  const sendResponse = vi.fn();
  const message = createAuthorizedOffscreenMessage(createStopCommand());
  const routeReturn = listener(
    { ...message, discard: false },
    generatedBackgroundSender,
    sendResponse
  );

  await flushRuntimeRouting();

  expectPreParseFailure(sendResponse, 'Offscreen command capability binding mismatch', routeReturn);
});

it('rejects stale command capability before parsing', async () => {
  const listener = await captureSubscriptionListener();
  const sendResponse = vi.fn();
  const message = attachRuntimeMessageFreshness(
    attachOffscreenCommandCapability(createStopCommand(), 0)
  );
  const routeReturn = listener(message, generatedBackgroundSender, sendResponse);

  await flushRuntimeRouting();

  expectPreParseFailure(sendResponse, 'Invalid offscreen command capability', routeReturn);
});

it('rejects replayed freshness before dispatching the replay', async () => {
  const listener = await captureSubscriptionListener();
  const sendResponse = vi.fn();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  const message = createAuthorizedOffscreenMessage(createStopCommand());

  listener(message, generatedBackgroundSender, sendResponse);
  const replayReturn = listener(message, generatedBackgroundSender, sendResponse);
  await flushRuntimeRouting();

  expect(replayReturn).toBe(false);
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Runtime message replay detected',
  });
  expect(stopRecordingMock).toHaveBeenCalledTimes(1);
});

it('rejects stale freshness before parsing', async () => {
  const listener = await captureSubscriptionListener();
  const sendResponse = vi.fn();
  const staleFreshness = attachRuntimeMessageFreshness(
    attachOffscreenCommandCapability(createStopCommand()),
    { issuedAtEpochMs: 0, nonce: 'stale-freshness' }
  );
  const routeReturn = listener(staleFreshness, generatedBackgroundSender, sendResponse);

  await flushRuntimeRouting();

  expectPreParseFailure(sendResponse, 'Stale runtime message freshness', routeReturn);
});

it('rejects rate-limited commands before dispatch', async () => {
  const listener = await captureSubscriptionListener();
  const sendResponse = vi.fn();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);

  for (let index = 0; index < OFFSCREEN_COMMAND_RATE_LIMIT_MAX_FOR_TESTS; index += 1) {
    listener(createAuthorizedOffscreenMessage(createStopCommand()), generatedBackgroundSender);
  }
  const routeReturn = listener(
    createAuthorizedOffscreenMessage(createStopCommand()),
    generatedBackgroundSender,
    sendResponse
  );
  await flushRuntimeRouting();

  expect(routeReturn).toBe(false);
  expect(sendResponse).toHaveBeenCalledWith({
    success: false,
    error: 'Offscreen command rate limit exceeded',
  });
  expect(stopRecordingMock).toHaveBeenCalledTimes(OFFSCREEN_COMMAND_RATE_LIMIT_MAX_FOR_TESTS);
});
