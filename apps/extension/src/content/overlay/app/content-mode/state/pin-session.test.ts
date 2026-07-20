// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installContentRuntimeMessagingMock } from '../../../../application/runtime-services/services.test-support';

const browserStorageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  isAvailable: vi.fn(() => false),
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

import {
  loadContentPinToTabSessionState,
  readContentPinToTabSessionState,
  writeContentPinToTabSessionState,
} from './pin-session';

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  installContentRuntimeMessagingMock(browserStorageMocks.sendRuntimeMessage);
  browserStorageMocks.get.mockReset();
  browserStorageMocks.isAvailable.mockReset();
  browserStorageMocks.remove.mockReset();
  browserStorageMocks.sendRuntimeMessage.mockReset();
  browserStorageMocks.set.mockReset();
  loggerMocks.warn.mockReset();
  browserStorageMocks.isAvailable.mockReturnValue(false);
  browserStorageMocks.remove.mockResolvedValue(undefined);
  browserStorageMocks.sendRuntimeMessage.mockResolvedValue({
    success: true,
    documentId: 'content-document-7',
    enabled: true,
    tabId: 7,
    viewport: null,
  });
  browserStorageMocks.set.mockResolvedValue(undefined);
  window.sessionStorage.clear();
});

it('does not treat page window session storage as authoritative initial state', () => {
  window.sessionStorage.setItem('sniptale.content.pin-to-tab', 'true');

  expect(readContentPinToTabSessionState()).toBe(false);
});

it('does not write fallback window session state when browser session storage is unavailable', () => {
  writeContentPinToTabSessionState(true);

  expect(readContentPinToTabSessionState()).toBe(false);
  expect(window.sessionStorage.getItem('sniptale.content.pin-to-tab')).toBeNull();
  expect(browserStorageMocks.set).not.toHaveBeenCalled();
});

it('uses browser session storage as the authoritative write path when it is available', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  window.sessionStorage.setItem('sniptale.content.pin-to-tab', 'true');

  writeContentPinToTabSessionState(true);
  await flushMicrotasks();

  expect(browserStorageMocks.set).toHaveBeenCalledWith({
    'sniptale.content.pin-to-tab:tab:7': true,
  });
});

it('ignores the legacy global browser session key when hydrating pin state', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.get.mockResolvedValueOnce({
    'sniptale.content.pin-to-tab': true,
    'sniptale.content.pin-to-tab:tab:7': false,
  });

  await expect(loadContentPinToTabSessionState()).resolves.toBe(false);
  expect(browserStorageMocks.get).toHaveBeenCalledWith({
    'sniptale.content.pin-to-tab:tab:7': false,
  });
});

it('does not hydrate the tab-scoped pin when background mode was cleared for the tab', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.sendRuntimeMessage.mockResolvedValueOnce({
    success: true,
    documentId: 'content-document-7',
    enabled: false,
    tabId: 7,
    viewport: null,
  });

  await expect(loadContentPinToTabSessionState()).resolves.toBe(false);
  expect(browserStorageMocks.remove).not.toHaveBeenCalled();
  expect(browserStorageMocks.get).not.toHaveBeenCalled();
});

it('does not persist a pinned state when background mode is disabled for the tab', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.sendRuntimeMessage.mockResolvedValueOnce({
    success: true,
    documentId: 'content-document-7',
    enabled: false,
    tabId: 7,
    viewport: null,
  });

  writeContentPinToTabSessionState(true);
  await flushMicrotasks();

  expect(browserStorageMocks.set).not.toHaveBeenCalled();
});

it('uses the tab-scoped pin when screenshot status has no sender document id', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.get.mockResolvedValueOnce({
    'sniptale.content.pin-to-tab:tab:7': true,
  });
  browserStorageMocks.sendRuntimeMessage
    .mockResolvedValueOnce({
      success: true,
      enabled: true,
      tabId: 7,
      viewport: null,
    })
    .mockResolvedValueOnce({
      success: true,
      enabled: true,
      tabId: 7,
      viewport: null,
    });

  await expect(loadContentPinToTabSessionState()).resolves.toBe(true);
  writeContentPinToTabSessionState(true);
  await flushMicrotasks();

  expect(browserStorageMocks.get).toHaveBeenCalledWith({
    'sniptale.content.pin-to-tab:tab:7': false,
  });
  expect(browserStorageMocks.set).toHaveBeenCalledWith({
    'sniptale.content.pin-to-tab:tab:7': true,
  });
});

it('keeps pin session state across documents in the same tab', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.get.mockResolvedValueOnce({
    'sniptale.content.pin-to-tab:tab:7': true,
  });
  browserStorageMocks.sendRuntimeMessage.mockResolvedValueOnce({
    success: true,
    documentId: 'content-document-new',
    enabled: true,
    tabId: 7,
    viewport: null,
  });

  await expect(loadContentPinToTabSessionState()).resolves.toBe(true);

  expect(browserStorageMocks.get).toHaveBeenCalledWith({
    'sniptale.content.pin-to-tab:tab:7': false,
  });
});

it('fails closed when the authoritative load fails', async () => {
  browserStorageMocks.isAvailable.mockReturnValue(true);
  browserStorageMocks.get.mockRejectedValue(new Error('session offline'));
  window.sessionStorage.setItem('sniptale.content.pin-to-tab', 'true');

  await expect(loadContentPinToTabSessionState()).resolves.toBe(false);
  expect(loggerMocks.warn).toHaveBeenCalledWith(
    'Failed to load authoritative pin-to-tab session state',
    expect.any(Error)
  );
});

describe('pin-session denied storage fallback', () => {
  it('silently fails closed when browser storage access is denied', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.get.mockRejectedValue(
      new Error('Access to storage is not allowed from this context.')
    );
    window.sessionStorage.setItem('sniptale.content.pin-to-tab', 'true');

    await expect(loadContentPinToTabSessionState()).resolves.toBe(false);
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it('treats object-shaped denied storage read errors as a silent closed path', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.get.mockRejectedValue({
      message: 'Access to storage is not allowed from this context.',
    });
    window.sessionStorage.setItem('sniptale.content.pin-to-tab', 'true');

    await expect(loadContentPinToTabSessionState()).resolves.toBe(false);
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it('does not write window fallback state when browser storage persistence is denied', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.set.mockRejectedValue(
      new Error('Access to storage is not allowed from this context.')
    );

    writeContentPinToTabSessionState(true);
    await flushMicrotasks();

    expect(window.sessionStorage.getItem('sniptale.content.pin-to-tab')).toBeNull();
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });

  it('does not write window fallback state for object-shaped denied storage writes', async () => {
    browserStorageMocks.isAvailable.mockReturnValue(true);
    browserStorageMocks.set.mockRejectedValue({
      message: 'Access to storage is not allowed from this context.',
    });

    writeContentPinToTabSessionState(true);
    await flushMicrotasks();

    expect(window.sessionStorage.getItem('sniptale.content.pin-to-tab')).toBeNull();
    expect(loggerMocks.warn).not.toHaveBeenCalled();
  });
});
