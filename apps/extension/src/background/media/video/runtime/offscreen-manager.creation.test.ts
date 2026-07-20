import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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

beforeEach(() => {
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
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('starts without an offscreen document on a fresh module import', async () => {
  const manager = await loadOffscreenManager();
  expect(manager.hasOffscreenDocument()).toBe(false);
});

it('marks the offscreen document as ready and short-circuits future creation', async () => {
  const manager = await loadOffscreenManager();
  manager.markOffscreenDocumentReady();
  await expect(manager.ensureOffscreenDocument()).resolves.toBe(false);
  expect(manager.hasOffscreenDocument()).toBe(true);
  expect(browserRuntimeGetURLMock).not.toHaveBeenCalled();
});

it('reuses an existing offscreen context instead of creating a new one', async () => {
  const manager = await loadOffscreenManager();
  browserRuntimeGetContextsMock.mockResolvedValue([
    {
      contextId: 'ctx-1',
      documentUrl:
        'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=startup-existing',
    } as chrome.runtime.ExtensionContext,
  ]);

  await expect(manager.ensureOffscreenDocument('Reuse existing document')).resolves.toBe(false);

  expect(browserRuntimeGetURLMock).toHaveBeenCalledWith(
    'apps/extension/src/offscreen/offscreen.html'
  );
  expect(browserRuntimeGetContextsMock).toHaveBeenCalledWith({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
  });
  expect(browserOffscreenCreateDocumentMock).not.toHaveBeenCalled();
  expect(loggerDebugMock).toHaveBeenCalledWith('Reusing existing ready offscreen document', {
    offscreenStartupId: 'startup-existing',
  });
  expect(manager.hasOffscreenDocument()).toBe(true);
});

it('treats a reused offscreen context as already ready after worker state recovery', async () => {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  browserRuntimeGetContextsMock.mockResolvedValue([
    { contextId: 'ctx-1' } as chrome.runtime.ExtensionContext,
  ]);

  await manager.ensureOffscreenDocument('Reuse existing document');

  await expect(manager.waitForOffscreenReady(25)).resolves.toBeUndefined();

  expect(browserRuntimeSubscribeToMessagesMock).not.toHaveBeenCalled();
});

it('creates a new offscreen document when none exists yet', async () => {
  const manager = await loadOffscreenManager();

  await expect(manager.ensureOffscreenDocument('Custom recording reason')).resolves.toBe(true);

  expect(browserOffscreenCreateDocumentMock).toHaveBeenCalledWith({
    url: 'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=startup-1',
    reasons: ['USER_MEDIA'],
    justification: 'Custom recording reason',
  });
  expect(loggerLogMock).toHaveBeenCalledWith('Created offscreen document');
  expect(manager.hasOffscreenDocument()).toBe(true);
});

it('creates an isolated lightweight local-storage document for privacy erasure', async () => {
  let readyListener: ((message: unknown, sender: chrome.runtime.MessageSender) => void) | undefined;
  browserRuntimeSubscribeToMessagesMock.mockImplementation((listener) => {
    readyListener = listener;
    return vi.fn();
  });
  const { createOffscreenManagerService } = await loadOffscreenManager();
  const manager = createOffscreenManagerService();
  const preparation = manager.ensurePrivacyErasureOffscreenDocument();
  await vi.waitFor(() => expect(readyListener).toBeDefined());
  readyListener?.(
    { type: 'OFFSCREEN_READY', offscreenStartupId: 'startup-1' },
    {
      url: 'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?privacyErasure=1',
    }
  );

  await preparation;

  const privacyErasureDocumentUrl =
    'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?' +
    'offscreenStartupId=startup-1&privacyErasure=1';
  expect(browserOffscreenCreateDocumentMock).toHaveBeenCalledWith({
    url: privacyErasureDocumentUrl,
    reasons: ['LOCAL_STORAGE'],
    justification: 'Erase and verify extension-origin local storage',
  });
});

it('creates a document after logging a failed runtime-context lookup', async () => {
  const manager = await loadOffscreenManager();
  const lookupError = new Error('contexts unavailable');
  browserRuntimeGetContextsMock.mockRejectedValue(lookupError);

  await expect(manager.ensureOffscreenDocument()).resolves.toBe(true);

  expect(loggerWarnMock).toHaveBeenCalledWith(
    'Failed to inspect runtime contexts before offscreen creation',
    lookupError
  );
  expect(browserOffscreenCreateDocumentMock).toHaveBeenCalledWith({
    url: 'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=startup-1',
    reasons: ['USER_MEDIA'],
    justification: 'Recording tab video',
  });
});

it('preserves the ready state when OFFSCREEN_READY arrives before createDocument resolves', async () => {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  let resolveCreateDocument!: () => void;
  browserOffscreenCreateDocumentMock.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resolveCreateDocument = resolve;
      })
  );

  const ensurePromise = manager.ensureOffscreenDocument('Custom recording reason');
  await Promise.resolve();
  manager.markOffscreenDocumentReady('startup-1');
  resolveCreateDocument();

  await ensurePromise;
  await expect(manager.waitForOffscreenReady(25)).resolves.toBeUndefined();
  expect(browserRuntimeSubscribeToMessagesMock).not.toHaveBeenCalled();
});

it('closes a timed-out startup before creating a replacement offscreen document', async () => {
  vi.useFakeTimers();
  const manager = await loadOffscreenManager();
  randomUuidMock.mockReturnValueOnce('startup-1').mockReturnValueOnce('startup-2');

  await manager.ensureOffscreenDocument('Start recording');
  const waitResult = manager.waitForOffscreenReady(25).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(25);
  await expect(waitResult).resolves.toEqual(expect.any(Error));
  await expect(manager.ensureOffscreenDocument('Retry recording')).resolves.toBe(true);

  expect(browserOffscreenCloseDocumentMock).toHaveBeenCalledOnce();
  expect(loggerWarnMock).toHaveBeenCalledWith('Closed failed offscreen document', {
    reason: 'runtime failure',
  });
  expect(browserOffscreenCreateDocumentMock).toHaveBeenLastCalledWith({
    url: 'chrome-extension://id/apps/extension/src/offscreen/offscreen.html?offscreenStartupId=startup-2',
    reasons: ['USER_MEDIA'],
    justification: 'Retry recording',
  });
});

it('supports isolated service instances for owner-local readiness checks', async () => {
  const { createOffscreenManagerService } = await loadOffscreenManager();
  const manager = createOffscreenManagerService();

  expect(manager.hasOffscreenDocument()).toBe(false);
  expect(manager.markOffscreenDocumentReady()).toBe(true);
  await expect(manager.waitForOffscreenReady(25)).resolves.toBeUndefined();
  await expect(manager.ensureOffscreenDocument('Already ready')).resolves.toBe(false);
  expect(browserOffscreenCreateDocumentMock).not.toHaveBeenCalled();
});

it('closes and verifies an existing offscreen context for local data erasure', async () => {
  const manager = await loadOffscreenManager();
  browserRuntimeGetContextsMock
    .mockResolvedValueOnce([{ contextId: 'ctx-1' } as chrome.runtime.ExtensionContext])
    .mockResolvedValueOnce([]);

  await expect(manager.closeOffscreenDocumentForPrivacyErasure()).resolves.toBeUndefined();

  expect(browserOffscreenCloseDocumentMock).toHaveBeenCalledOnce();
  expect(browserRuntimeGetContextsMock).toHaveBeenCalledTimes(2);
  expect(loggerLogMock).toHaveBeenCalledWith('Closed offscreen document for local data erasure');
  expect(manager.hasOffscreenDocument()).toBe(false);
});

it('fails local data erasure close when the offscreen context remains active', async () => {
  const manager = await loadOffscreenManager();
  browserRuntimeGetContextsMock.mockResolvedValue([
    { contextId: 'ctx-1' } as chrome.runtime.ExtensionContext,
  ]);

  await expect(manager.closeOffscreenDocumentForPrivacyErasure()).rejects.toThrow(
    'remained active'
  );
});
