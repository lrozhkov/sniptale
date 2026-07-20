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

async function expectReadyTimeout(waitPromise: Promise<unknown>): Promise<void> {
  await expect(waitPromise).resolves.toEqual(
    expect.objectContaining({ message: 'Timed out while waiting for offscreen ready signal' })
  );
}

async function verifyReadyFromNonOffscreenSenderIsIgnored() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  await manager.ensureOffscreenDocument('Start recording');
  const subscription = createMessageSubscription();
  const timeoutResult = manager.waitForOffscreenReady(25).catch((error: unknown) => error);

  subscription.emit(
    { type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' },
    { url: 'chrome-extension://id/apps/extension/src/settings/index.html' }
  );
  await vi.advanceTimersByTimeAsync(25);

  await expectReadyTimeout(timeoutResult);
  expect(subscription.unsubscribeMock).toHaveBeenCalledOnce();
  expect(manager.hasOffscreenDocument()).toBe(true);
}

async function verifyReadyTimeoutIsClearedAfterSuccess() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  await manager.ensureOffscreenDocument('Start recording');
  const subscription = createMessageSubscription();
  const waitPromise = manager.waitForOffscreenReady(250);

  subscription.emit({ type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'startup-1' });
  await waitPromise;
  await vi.advanceTimersByTimeAsync(250);

  expect(loggerWarnMock).not.toHaveBeenCalledWith(
    'Timed out while waiting for offscreen ready signal'
  );
}

async function verifyStaleReadySignalIsIgnored() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  await manager.ensureOffscreenDocument('Start recording');
  const subscription = createMessageSubscription();
  const timeoutResult = manager.waitForOffscreenReady(25).catch((error: unknown) => error);

  subscription.emit({ type: VideoMessageType.OFFSCREEN_READY, offscreenStartupId: 'old-startup' });
  await vi.advanceTimersByTimeAsync(25);

  await expectReadyTimeout(timeoutResult);
  expect(loggerWarnMock).toHaveBeenCalledWith('Ignoring stale offscreen ready signal', {
    expectedStartupId: 'startup-1',
    offscreenStartupId: 'old-startup',
  });
}

async function verifyStaleRuntimeStartupErrorIsIgnored() {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  await manager.ensureOffscreenDocument('Start recording');
  const subscription = createMessageSubscription();
  const timeoutResult = manager.waitForOffscreenReady(25).catch((error: unknown) => error);

  subscription.emit({
    type: VideoMessageType.OFFSCREEN_ERROR,
    offscreenStartupId: 'old-startup',
    phase: 'runtime',
    error: 'stale db unavailable',
  });
  await vi.advanceTimersByTimeAsync(25);

  await expectReadyTimeout(timeoutResult);
  expect(loggerWarnMock).toHaveBeenCalledWith('Ignoring stale offscreen error signal', {
    expectedStartupId: 'startup-1',
    offscreenStartupId: 'old-startup',
  });
}

async function verifyFailedStartupIgnoresLateReady() {
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

  expect(manager.markOffscreenDocumentReady('startup-1')).toBe(false);
  await expect(manager.ensureOffscreenDocument('Retry startup')).resolves.toBe(true);
  expect(browserOffscreenCloseDocumentMock).toHaveBeenCalledOnce();
  expect(browserOffscreenCreateDocumentMock).toHaveBeenLastCalledWith({
    url: 'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=startup-2',
    reasons: ['USER_MEDIA'],
    justification: 'Retry startup',
  });
}

describe('offscreen-manager stale generation readiness', () => {
  beforeEach(resetOffscreenMocks);
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it(
    'ignores ready signals from non-offscreen senders',
    verifyReadyFromNonOffscreenSenderIsIgnored
  );
  it('clears the ready timeout after a successful signal', verifyReadyTimeoutIsClearedAfterSuccess);
  it('ignores stale ready signals', verifyStaleReadySignalIsIgnored);
  it('ignores stale runtime startup errors', verifyStaleRuntimeStartupErrorIsIgnored);
  it(
    'keeps a failed startup generation failed after late ready',
    verifyFailedStartupIgnoresLateReady
  );
});
