import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserRuntimeSubscribeToMessagesMock,
  loggerDebugMock,
  parseOffscreenRuntimeMessageMock,
  sendRuntimeMessageMock,
  startRecordingMock,
} = vi.hoisted(() => ({
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  parseOffscreenRuntimeMessageMock: vi.fn(),
  sendRuntimeMessageMock: vi.fn(),
  startRecordingMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    subscribeToMessages: browserRuntimeSubscribeToMessagesMock,
  },
  runtimeInfo: {
    getURL: (path: string) => `chrome-extension://test/${path}`,
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

vi.mock('../../platform/runtime-messaging/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/runtime-messaging/index')>()),
  sendRuntimeMessage: sendRuntimeMessageMock,
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
  startRecording: startRecordingMock,
  stopRecording: vi.fn(),
  updateViewportCrop: vi.fn(),
}));

vi.mock('../recording/context', () => ({
  recordingContext: { currentRecordingId: null },
}));

vi.mock('../project-export/index', () => ({
  cancelProjectExport: vi.fn(),
  getProjectExportCapabilities: vi.fn(),
  reconcileProjectExportJobs: vi.fn(),
  startProjectExport: vi.fn(),
}));
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { attachOffscreenCommandCapability } from '@sniptale/platform/security/offscreen-command-capability';
import { attachRuntimeMessageFreshness } from '@sniptale/platform/security/runtime-message-freshness';

type SubscriptionListener = (
  message: unknown,
  sender?: chrome.runtime.MessageSender,
  sendResponse?: (response?: unknown) => void
) => unknown;

const trustedBackgroundSender = {
  id: 'sniptale-extension',
  url: 'chrome-extension://sniptale-extension/service-worker-loader.js',
} as chrome.runtime.MessageSender;
let freshnessNonceSequence = 0;

function emitTrustedRuntimeMessage(
  listener: SubscriptionListener,
  message: { type: string } & Record<string, unknown>
): unknown {
  freshnessNonceSequence += 1;
  return listener(
    attachRuntimeMessageFreshness(attachOffscreenCommandCapability(message), {
      issuedAtEpochMs: Date.now(),
      nonce: `offscreen-start-error-nonce-${freshnessNonceSequence}`,
    }),
    trustedBackgroundSender
  );
}

async function flushRuntimeRouting() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

function resetStartErrorMocks() {
  vi.clearAllMocks();
  vi.resetModules();
  freshnessNonceSequence = 0;
  sendRuntimeMessageMock.mockResolvedValue(undefined);
}

function emitStartRecordingMessage(listener: SubscriptionListener): unknown {
  return emitTrustedRuntimeMessage(listener, {
    type: 'OFFSCREEN_START_RECORDING',
    settings: {},
    streamId: 'stream-1',
    recordingId: 'rec-1',
  });
}

async function verifiesStartFailuresAreReportedBeforeBackgroundWatchdog() {
  const listener = await captureSubscriptionListener();
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  startRecordingMock.mockRejectedValueOnce(new Error('start failed'));

  emitStartRecordingMessage(listener);
  await flushRuntimeRouting();

  expect(sendRuntimeMessageMock).toHaveBeenCalledWith({
    type: VideoMessageType.OFFSCREEN_ERROR,
    error: 'start failed',
    phase: 'start',
    recordingId: 'rec-1',
  });
  expect(loggerDebugMock).toHaveBeenLastCalledWith(
    'Offscreen runtime start message failed before local reporting',
    expect.objectContaining({ errorMessage: 'start failed' })
  );
}

async function verifiesLocallyReportedStartFailuresAreNotReportedTwice() {
  const listener = await captureSubscriptionListener();
  const { markRecordingStartErrorReported } = await import('../recording/start/error-reporting');
  const reportedError = markRecordingStartErrorReported(new Error('start failed'));
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  startRecordingMock.mockRejectedValueOnce(reportedError);

  emitStartRecordingMessage(listener);
  await flushRuntimeRouting();

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(loggerDebugMock).toHaveBeenLastCalledWith(
    'Offscreen runtime start message failed after local reporting',
    expect.objectContaining({ errorMessage: 'start failed' })
  );
}

async function verifiesPrimitiveStartFailuresAreNotReportedTwice() {
  const listener = await captureSubscriptionListener();
  const { markRecordingStartErrorReported } = await import('../recording/start/error-reporting');
  const reportedError = markRecordingStartErrorReported('start failed');
  parseOffscreenRuntimeMessageMock.mockImplementation((message: unknown) => message);
  startRecordingMock.mockRejectedValueOnce(reportedError);

  emitStartRecordingMessage(listener);
  await flushRuntimeRouting();

  expect(sendRuntimeMessageMock).not.toHaveBeenCalled();
  expect(loggerDebugMock).toHaveBeenLastCalledWith(
    'Offscreen runtime start message failed after local reporting',
    expect.objectContaining({ errorMessage: 'start failed' })
  );
}

describe('offscreen-runtime start error paths', () => {
  beforeEach(resetStartErrorMocks);

  it(
    'reports start failures before the background watchdog timeout',
    verifiesStartFailuresAreReportedBeforeBackgroundWatchdog
  );
  it(
    'does not emit duplicate OFFSCREEN_ERROR messages after local start-failure reporting',
    verifiesLocallyReportedStartFailuresAreNotReportedTwice
  );
  it(
    'does not emit duplicate OFFSCREEN_ERROR messages for primitive start failures',
    verifiesPrimitiveStartFailuresAreNotReportedTwice
  );
});
