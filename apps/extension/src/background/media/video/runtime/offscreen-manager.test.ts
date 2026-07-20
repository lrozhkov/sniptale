import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

const {
  browserOffscreenCloseDocumentMock,
  browserOffscreenCreateDocumentMock,
  browserRuntimeGetContextsMock,
  browserRuntimeGetURLMock,
  browserRuntimeSubscribeToMessagesMock,
  loggerDebugMock,
  loggerLogMock,
  loggerWarnMock,
  randomUuidMock,
} = vi.hoisted(() => ({
  browserOffscreenCloseDocumentMock: vi.fn(),
  browserOffscreenCreateDocumentMock: vi.fn(),
  browserRuntimeGetContextsMock: vi.fn(),
  browserRuntimeGetURLMock: vi.fn(),
  browserRuntimeSubscribeToMessagesMock: vi.fn(),
  loggerDebugMock: vi.fn(),
  loggerLogMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  randomUuidMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/offscreen', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/offscreen')>()),
  browserOffscreen: {
    closeDocument: browserOffscreenCloseDocumentMock,
    createDocument: browserOffscreenCreateDocumentMock,
  },
}));

vi.mock('@sniptale/platform/browser/runtime', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/browser/runtime')>()),
  browserRuntime: {
    getContexts: browserRuntimeGetContextsMock,
    getURL: browserRuntimeGetURLMock,
    subscribeToMessages: browserRuntimeSubscribeToMessagesMock,
  },
  runtimeInfo: {
    getURL: browserRuntimeGetURLMock,
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    debug: loggerDebugMock,
    log: loggerLogMock,
    warn: loggerWarnMock,
  }),
}));

type OffscreenManagerModule = typeof import('./offscreen-manager');

async function loadOffscreenManager(): Promise<OffscreenManagerModule> {
  vi.resetModules();
  return import('./offscreen-manager');
}
function resetOffscreenMocks() {
  vi.clearAllMocks();
  randomUuidMock.mockReturnValue('startup-1');
  vi.stubGlobal('crypto', { randomUUID: randomUuidMock });
  browserRuntimeGetURLMock.mockReturnValue(
    'chrome-extension://id/apps/extension/src/offscreen/offscreen.html'
  );
  browserRuntimeGetContextsMock.mockResolvedValue([]);
  browserOffscreenCloseDocumentMock.mockResolvedValue(undefined);
  browserOffscreenCreateDocumentMock.mockResolvedValue(undefined);
  browserRuntimeSubscribeToMessagesMock.mockImplementation(() => vi.fn());
}
function createMessageSubscription() {
  const unsubscribeMock = vi.fn();
  let listener: ((message: unknown, sender: chrome.runtime.MessageSender) => void) | undefined;
  browserRuntimeSubscribeToMessagesMock.mockImplementation((callback) => {
    listener = callback;
    return unsubscribeMock;
  });
  return {
    emit(
      message: unknown,
      sender: chrome.runtime.MessageSender = {
        url: 'chrome-extension://id/apps/extension/src/offscreen/offscreen.html',
      }
    ) {
      listener?.(message, sender);
    },
    unsubscribeMock,
  };
}
function useOffscreenTestScope() {
  beforeEach(() => {
    resetOffscreenMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
}
async function expectReadyTimeout(waitPromise: Promise<unknown>): Promise<void> {
  const timeoutError = await waitPromise;
  expect(timeoutError).toEqual(
    expect.objectContaining({ message: 'Timed out while waiting for offscreen ready signal' })
  );
}
async function verifyWaitForReadySignal() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  await manager.ensureOffscreenDocument('Start recording');
  const subscription = createMessageSubscription();
  const waitPromise = manager.waitForOffscreenReady(250);
  subscription.emit({ type: 'IGNORED_MESSAGE' });
  expect(subscription.unsubscribeMock).not.toHaveBeenCalled();
  subscription.emit(
    { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' },
    { url: 'chrome-extension://id/apps/extension/src/popup/index.html' }
  );
  expect(subscription.unsubscribeMock).not.toHaveBeenCalled();
  subscription.emit({ type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' });
  await waitPromise;
  expect(subscription.unsubscribeMock).toHaveBeenCalledOnce();
  expect(loggerDebugMock).toHaveBeenCalledWith('Received offscreen ready signal');
  expect(manager.hasOffscreenDocument()).toBe(true);
  vi.clearAllTimers();
}
async function verifyReadyTimeoutFailure() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  await manager.ensureOffscreenDocument('Start recording');
  const subscription = createMessageSubscription();
  const timeoutResult = manager.waitForOffscreenReady(25).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(25);
  await expectReadyTimeout(timeoutResult);
  expect(subscription.unsubscribeMock).toHaveBeenCalledOnce();
  expect(loggerWarnMock).toHaveBeenCalledWith('Timed out while waiting for offscreen ready signal');
  expect(manager.hasOffscreenDocument()).toBe(true);
  vi.clearAllTimers();
}
async function verifyRuntimeStartupFailure() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  await manager.ensureOffscreenDocument('Start recording');
  const subscription = createMessageSubscription();
  const waitPromise = manager.waitForOffscreenReady(250);
  subscription.emit({
    type: VideoMessageType.OFFSCREEN_ERROR,
    offscreenStartupId: 'startup-1',
    phase: 'runtime',
    error: 'db unavailable',
  });
  await expect(waitPromise).rejects.toThrow('db unavailable');
  expect(subscription.unsubscribeMock).toHaveBeenCalledOnce();
  expect(loggerWarnMock).toHaveBeenCalledWith('Offscreen reported a startup failure', {
    error: 'db unavailable',
    phase: 'runtime',
  });
}
async function verifyRecreateAfterRuntimeStartupFailure() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  randomUuidMock.mockReturnValueOnce('startup-1').mockReturnValueOnce('startup-2');
  await manager.ensureOffscreenDocument('Start recording');
  const subscription = createMessageSubscription();
  const waitPromise = manager.waitForOffscreenReady(250);
  subscription.emit({
    type: VideoMessageType.OFFSCREEN_ERROR,
    offscreenStartupId: 'startup-1',
    phase: 'runtime',
    error: 'db unavailable',
  });
  await expect(waitPromise).rejects.toThrow('db unavailable');
  await expect(manager.ensureOffscreenDocument('Retry startup')).resolves.toBe(true);
  expect(browserOffscreenCloseDocumentMock).toHaveBeenCalledOnce();
  expect(browserOffscreenCreateDocumentMock).toHaveBeenCalledWith({
    url: 'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=startup-2',
    reasons: ['USER_MEDIA'],
    justification: 'Retry startup',
  });
}
async function verifyRecreateAfterReadyTimeout() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  randomUuidMock.mockReturnValueOnce('startup-1').mockReturnValueOnce('startup-2');
  await manager.ensureOffscreenDocument('Start recording');
  createMessageSubscription();
  const timeoutResult = manager.waitForOffscreenReady(25).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(25);
  await expectReadyTimeout(timeoutResult);
  await expect(manager.ensureOffscreenDocument('Retry after timeout')).resolves.toBe(true);
  expect(browserOffscreenCloseDocumentMock).toHaveBeenCalledOnce();
  expect(browserOffscreenCreateDocumentMock).toHaveBeenCalledWith({
    url: 'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=startup-2',
    reasons: ['USER_MEDIA'],
    justification: 'Retry after timeout',
  });
}
async function verifyRetryFailsWhenBrokenOffscreenDocumentCannotBeClosed() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  await manager.ensureOffscreenDocument('Start recording');
  const subscription = createMessageSubscription();
  browserOffscreenCloseDocumentMock.mockRejectedValueOnce(new Error('close failed'));
  const waitPromise = manager.waitForOffscreenReady(250);
  subscription.emit({
    type: VideoMessageType.OFFSCREEN_ERROR,
    offscreenStartupId: 'startup-1',
    phase: 'runtime',
    error: 'db unavailable',
  });
  await expect(waitPromise).rejects.toThrow('db unavailable');
  await expect(manager.ensureOffscreenDocument('Retry startup')).rejects.toThrow('close failed');
  expect(browserOffscreenCreateDocumentMock).toHaveBeenCalledTimes(1);
  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to close offscreen document after startup failure',
    expect.objectContaining({
      error: expect.any(Error),
      reason: 'runtime failure',
    })
  );
}

describe('offscreen-manager waitForOffscreenReady', () => {
  useOffscreenTestScope();
  it(
    'resolves on the OFFSCREEN_READY message and marks the document as ready',
    verifyWaitForReadySignal
  );
  it('rejects after timeout when the ready signal never arrives', verifyReadyTimeoutFailure);
  it(
    'rejects when the offscreen document reports a runtime startup failure',
    verifyRuntimeStartupFailure
  );
  it(
    'recreates the offscreen document after a runtime startup failure',
    verifyRecreateAfterRuntimeStartupFailure
  );
  it('recreates the offscreen document after a ready timeout', verifyRecreateAfterReadyTimeout);
  it(
    'fails the retry when the broken offscreen document cannot be closed',
    verifyRetryFailsWhenBrokenOffscreenDocumentCannotBeClosed
  );
});
