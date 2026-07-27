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
  clearPinToTabSessionStorageState,
  createPinToTabToolbarVisibilitySessionStorageKey,
  createPinToTabSessionStorageKey,
  isPinToTabSessionStorageAccessDeniedError,
  isPinToTabSessionStorageAvailable,
  loadPinToTabSessionStorageState,
  readPinToTabSessionStorageState,
  readPinToTabToolbarVisibilitySessionStorageState,
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
    expect(createPinToTabToolbarVisibilitySessionStorageKey(7)).toBe(
      'sniptale.content.pin-to-tab-toolbar-visible:tab:7'
    );
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

  it('defaults pinned-toolbar visibility to expanded and reads a stored collapsed state', async () => {
    sessionGetMock
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ 'sniptale.content.pin-to-tab-toolbar-visible:tab:7': false });

    await expect(readPinToTabToolbarVisibilitySessionStorageState(7)).resolves.toBe(true);
    await expect(readPinToTabToolbarVisibilitySessionStorageState(7)).resolves.toBe(false);
  });

  it('defaults pinned-toolbar visibility to expanded when session storage is unavailable', async () => {
    sessionIsAvailableMock.mockReturnValue(false);

    await expect(readPinToTabToolbarVisibilitySessionStorageState(7)).resolves.toBe(true);
    expect(sessionGetMock).not.toHaveBeenCalled();
  });

  it('clears both tab-scoped pin session fields', async () => {
    await clearPinToTabSessionStorageState(7);

    expect(sessionRemoveMock).toHaveBeenCalledWith([
      'sniptale.content.pin-to-tab:tab:7',
      'sniptale.content.pin-to-tab-toolbar-visible:tab:7',
    ]);
  });
});

describe('content pin-to-tab session writes', () => {
  it('writes pinned state only while the guarded operation is current', async () => {
    await writePinToTabSessionStorageState(
      7,
      { pinToTab: true, toolbarVisible: false },
      () => false
    );
    await writePinToTabSessionStorageState(
      7,
      { pinToTab: true, toolbarVisible: false },
      () => true
    );

    expect(sessionSetMock).toHaveBeenCalledTimes(1);
    expect(sessionSetMock).toHaveBeenCalledWith({
      'sniptale.content.pin-to-tab-toolbar-visible:tab:7': false,
      'sniptale.content.pin-to-tab:tab:7': true,
    });
  });

  it('atomically removes pin and visibility when unpinning', async () => {
    await writePinToTabSessionStorageState(7, { pinToTab: false }, () => true);

    expect(sessionRemoveMock).toHaveBeenCalledTimes(1);
    expect(sessionRemoveMock).toHaveBeenCalledWith([
      'sniptale.content.pin-to-tab:tab:7',
      'sniptale.content.pin-to-tab-toolbar-visible:tab:7',
    ]);
  });

  it('writes tab-scoped collapsed visibility only while the operation is current', async () => {
    await writePinToTabSessionStorageState(7, { toolbarVisible: false }, () => false);
    await writePinToTabSessionStorageState(7, { toolbarVisible: false }, () => true);

    expect(sessionSetMock).toHaveBeenCalledTimes(1);
    expect(sessionSetMock).toHaveBeenCalledWith({
      'sniptale.content.pin-to-tab-toolbar-visible:tab:7': false,
    });
  });

  it('does not mutate toolbar visibility when storage is unavailable', async () => {
    sessionIsAvailableMock.mockReturnValue(false);
    await writePinToTabSessionStorageState(7, { toolbarVisible: false }, () => true);

    expect(sessionSetMock).not.toHaveBeenCalled();
  });
});
