import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionGetMock, sessionIsAvailableMock, sessionRemoveMock, sessionSetMock } = vi.hoisted(
  () => ({
    sessionGetMock: vi.fn(),
    sessionIsAvailableMock: vi.fn(),
    sessionRemoveMock: vi.fn(),
    sessionSetMock: vi.fn(),
  })
);

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: sessionGetMock,
      isAvailable: sessionIsAvailableMock,
      remove: sessionRemoveMock,
      set: sessionSetMock,
    },
  },
}));

import {
  clearAllPinToTabSessionStorageState,
  clearPinToTabSessionStorageState,
  createPinToTabSessionStorageKey,
  isPinToTabSessionStorageAccessDeniedError,
  isPinToTabSessionStorageAvailable,
  loadPinToTabSessionStorageState,
  readPinToTabSessionStorageState,
  writePinToTabSessionStorageState,
} from './index';

beforeEach(() => {
  vi.clearAllMocks();
  sessionGetMock.mockResolvedValue({});
  sessionIsAvailableMock.mockReturnValue(true);
  sessionRemoveMock.mockResolvedValue(undefined);
  sessionSetMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('content pin-to-tab session identity', () => {
  it('creates a tab-scoped storage key', () => {
    expect(createPinToTabSessionStorageKey(7)).toBe('sniptale.content.pin-to-tab:tab:7');
  });

  it('reports availability and storage access denied errors', () => {
    sessionIsAvailableMock.mockReturnValue(false);

    expect(isPinToTabSessionStorageAvailable()).toBe(false);
    expect(
      isPinToTabSessionStorageAccessDeniedError(
        new Error('Access to storage is not allowed from this context.')
      )
    ).toBe(true);
    expect(isPinToTabSessionStorageAccessDeniedError({ message: 'other failure' })).toBe(false);
  });
});

describe('content pin-to-tab session reads', () => {
  it('loads boolean pin state through browser session storage without repairing reads', async () => {
    sessionGetMock.mockResolvedValueOnce({ 'pin-key': true });

    await expect(
      loadPinToTabSessionStorageState({
        screenshotModeEnabled: true,
        storageKey: 'pin-key',
      })
    ).resolves.toBe(true);

    expect(sessionGetMock).toHaveBeenCalledWith({ 'pin-key': false });
    expect(sessionSetMock).not.toHaveBeenCalled();
    expect(sessionRemoveMock).not.toHaveBeenCalled();
  });

  it('reads tab-scoped pin state for background restore', async () => {
    sessionGetMock.mockResolvedValueOnce({ 'sniptale.content.pin-to-tab:tab:7': true });

    await expect(readPinToTabSessionStorageState(7)).resolves.toBe(true);

    expect(sessionGetMock).toHaveBeenCalledWith({ 'sniptale.content.pin-to-tab:tab:7': false });
  });

  it('clears one tab or all tab-scoped pin states', async () => {
    sessionGetMock.mockResolvedValueOnce({
      'other-key': true,
      'sniptale.content.pin-to-tab:tab:7': true,
      'sniptale.content.pin-to-tab:tab:8': true,
    });

    await clearPinToTabSessionStorageState(7);
    await clearAllPinToTabSessionStorageState();

    expect(sessionRemoveMock).toHaveBeenNthCalledWith(1, 'sniptale.content.pin-to-tab:tab:7');
    expect(sessionRemoveMock).toHaveBeenNthCalledWith(2, [
      'sniptale.content.pin-to-tab:tab:7',
      'sniptale.content.pin-to-tab:tab:8',
    ]);
  });
});

describe('content pin-to-tab session writes', () => {
  it('writes pinned state only while current and screenshot mode is enabled', async () => {
    await writePinToTabSessionStorageState(
      { screenshotModeEnabled: false, storageKey: 'pin-key' },
      true,
      () => true
    );
    await writePinToTabSessionStorageState(
      { screenshotModeEnabled: true, storageKey: 'pin-key' },
      true,
      () => false
    );
    await writePinToTabSessionStorageState(
      { screenshotModeEnabled: true, storageKey: 'pin-key' },
      true,
      () => true
    );

    expect(sessionSetMock).toHaveBeenCalledTimes(1);
    expect(sessionSetMock).toHaveBeenCalledWith({ 'pin-key': true });
  });

  it('removes unpinned state through browser session storage', async () => {
    await writePinToTabSessionStorageState(
      { screenshotModeEnabled: false, storageKey: 'pin-key' },
      false,
      () => true
    );

    expect(sessionRemoveMock).toHaveBeenCalledWith('pin-key');
  });
});
