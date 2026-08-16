import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({ getMock: vi.fn(), setMock: vi.fn() }));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: getMock, set: setMock } },
}));

import {
  DEFAULT_POPUP_STARTUP_STATE,
  loadPopupStartupState,
  savePopupLastPage,
  savePopupStartupSelection,
} from './popup-startup';

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({});
  setMock.mockResolvedValue(undefined);
});

it('loads defaults without repairing malformed storage', async () => {
  getMock.mockResolvedValue({
    sniptale_popup_startup: { selection: 'unknown', lastPage: 'settings' },
  });
  await expect(loadPopupStartupState()).resolves.toEqual(DEFAULT_POPUP_STARTUP_STATE);
  expect(setMock).not.toHaveBeenCalled();
});

it('keeps independently valid fields from stored state', async () => {
  getMock.mockResolvedValue({
    sniptale_popup_startup: { selection: 'video:screen', lastPage: 'invalid' },
  });
  await expect(loadPopupStartupState()).resolves.toEqual({
    selection: 'video:screen',
    lastPage: 'menu',
  });
});

it('loads the new top-level menu and tools destinations from the existing selection field', async () => {
  getMock.mockResolvedValue({
    sniptale_popup_startup: { selection: 'tools', lastPage: 'menu' },
  });
  await expect(loadPopupStartupState()).resolves.toEqual({
    selection: 'tools',
    lastPage: 'menu',
  });
});

it.each([
  ['screenshots:tools', 'tools'],
  ['video:area', 'video:tab'],
] as const)(
  'maps the retired %s destination to its current surface',
  async (selection, expected) => {
    getMock.mockResolvedValue({
      sniptale_popup_startup: { selection, lastPage: 'menu' },
    });
    await expect(loadPopupStartupState()).resolves.toEqual({
      selection: expected,
      lastPage: 'menu',
    });
    expect(setMock).not.toHaveBeenCalled();
  }
);

it('persists startup selection without overwriting the last page', async () => {
  getMock.mockResolvedValue({
    sniptale_popup_startup: { selection: 'remember-last', lastPage: 'video' },
  });
  await savePopupStartupSelection('screenshots:desktop');
  expect(setMock).toHaveBeenCalledWith(
    {
      sniptale_popup_startup: { selection: 'screenshots:desktop', lastPage: 'video' },
    },
    expect.any(Object)
  );
});

it('persists the last page without changing the startup selection', async () => {
  getMock.mockResolvedValue({
    sniptale_popup_startup: { selection: 'video:camera', lastPage: 'home' },
  });
  await savePopupLastPage('export');
  expect(setMock).toHaveBeenCalledWith(
    {
      sniptale_popup_startup: { selection: 'video:camera', lastPage: 'export' },
    },
    expect.any(Object)
  );
});
