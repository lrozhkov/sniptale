// @vitest-environment jsdom

import { beforeEach, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../../application/runtime-services/services.test-support';

const browserStorageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  isAvailable: vi.fn(() => true),
  remove: vi.fn(),
  sendRuntimeMessage: vi.fn(),
  set: vi.fn(),
}));

const loggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
}));

vi.mock(
  '../../../../../composition/persistence/infrastructure/browser-storage',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../../../composition/persistence/infrastructure/browser-storage')
    >()),
    browserStorage: {
      session: browserStorageMocks,
    },
  })
);

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => loggerMocks,
}));

vi.mock('../../../../../platform/runtime-messaging', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/runtime-messaging')>()),
  sendRuntimeMessage: browserStorageMocks.sendRuntimeMessage,
}));

import { loadContentPinToTabSessionState, writeContentPinToTabSessionState } from './pin-session';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(async () => {
  await flushMicrotasks();
  installContentRuntimeMessagingMock(browserStorageMocks.sendRuntimeMessage);
  browserStorageMocks.get.mockReset();
  browserStorageMocks.isAvailable.mockReset();
  browserStorageMocks.remove.mockReset();
  browserStorageMocks.sendRuntimeMessage.mockReset();
  browserStorageMocks.set.mockReset();
  loggerMocks.warn.mockReset();
  browserStorageMocks.get.mockResolvedValue({});
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.remove.mockResolvedValue(undefined);
  browserStorageMocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    documentId: 'content-document-7',
    enabled: true,
    tabId: 7,
    viewport: null,
  });
  browserStorageMocks.set.mockResolvedValue(undefined);
});

it('keeps disabled-mode hydration read-only before a newer pin write', async () => {
  browserStorageMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      success: true,
      documentId: 'content-document-7',
      enabled: false,
      tabId: 7,
      viewport: null,
    })
    .mockResolvedValueOnce({
      success: true,
      documentId: 'content-document-7',
      enabled: true,
      tabId: 7,
      viewport: null,
    });

  await expect(loadContentPinToTabSessionState()).resolves.toBe(false);
  writeContentPinToTabSessionState(true);
  await flushMicrotasks();

  expect(browserStorageMocks.remove).not.toHaveBeenCalled();
  expect(browserStorageMocks.set).toHaveBeenCalledWith({
    'sniptale.content.pin-to-tab:tab:7': true,
  });
});

it('serializes a newer unpin after an older delayed pin storage write', async () => {
  const setStorage = createDeferred<void>();
  browserStorageMocks.set.mockReturnValueOnce(setStorage.promise);

  writeContentPinToTabSessionState(true);
  await flushMicrotasks();
  expect(browserStorageMocks.set).toHaveBeenCalledWith({
    'sniptale.content.pin-to-tab:tab:7': true,
  });

  writeContentPinToTabSessionState(false);
  await flushMicrotasks();
  expect(browserStorageMocks.remove).not.toHaveBeenCalled();

  setStorage.resolve(undefined);
  await flushMicrotasks();

  expect(browserStorageMocks.remove).toHaveBeenCalledWith('sniptale.content.pin-to-tab:tab:7');
  expect(browserStorageMocks.set.mock.invocationCallOrder[0]!).toBeLessThan(
    browserStorageMocks.remove.mock.invocationCallOrder[0]!
  );
});

it('does not let an older delayed status write restore a newer unpinned state', async () => {
  const firstStatus = createDeferred<unknown>();
  let generation = 0;
  const write = (value: boolean) => {
    const writeGeneration = generation + 1;
    generation = writeGeneration;
    writeContentPinToTabSessionState(value, () => generation === writeGeneration);
  };

  browserStorageMocks.sendRuntimeMessage.mockReturnValueOnce(firstStatus.promise);

  write(true);
  write(false);
  firstStatus.resolve({
    success: true,
    documentId: 'content-document-7',
    enabled: true,
    tabId: 7,
    viewport: null,
  });
  await flushMicrotasks();

  expect(browserStorageMocks.set).not.toHaveBeenCalled();
  expect(browserStorageMocks.remove).toHaveBeenCalledWith('sniptale.content.pin-to-tab:tab:7');
});
