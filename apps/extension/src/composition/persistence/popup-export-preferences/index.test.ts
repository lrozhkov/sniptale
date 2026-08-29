import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({ getMock: vi.fn(), setMock: vi.fn() }));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: getMock, set: setMock } },
}));

import {
  DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES,
  loadPopupExportPreferences,
  loadPopupPagePackagePreferences,
  savePopupPagePackagePreferences,
} from './index';

beforeEach(() => vi.clearAllMocks());

it('uses independent current defaults and does not read the legacy key', async () => {
  getMock.mockResolvedValueOnce({
    sniptale_popup_export_preferences: { includeJson: false },
  });

  await expect(loadPopupPagePackagePreferences()).resolves.toEqual(
    DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES
  );
  expect(getMock).toHaveBeenCalledWith(['sniptale_popup_page_package_preferences']);
});

it('round-trips the exact current schema and projects download artifacts for context menu', async () => {
  const preferences = {
    export: {
      ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export,
      includeFullPageScreenshot: true,
      includeWebCopy: true,
    },
    save: { ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.save, includeJson: true },
  };
  getMock
    .mockResolvedValueOnce({
      sniptale_popup_page_package_preferences: {
        schemaVersion: 1,
        ...preferences,
      },
    })
    .mockResolvedValueOnce({
      sniptale_popup_page_package_preferences: {
        schemaVersion: 1,
        ...preferences,
      },
    });

  await expect(loadPopupPagePackagePreferences()).resolves.toEqual(preferences);
  await expect(loadPopupExportPreferences()).resolves.toEqual(
    expect.not.objectContaining({ includeWebCopy: expect.anything() })
  );
});

it('rejects malformed, partial, and incomplete Library Web-copy selections', async () => {
  getMock
    .mockResolvedValueOnce({ sniptale_popup_page_package_preferences: { schemaVersion: 1 } })
    .mockResolvedValueOnce({
      sniptale_popup_page_package_preferences: {
        schemaVersion: 1,
        export: DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export,
        save: { ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.save, includeWebCopy: false },
      },
    })
    .mockResolvedValueOnce({
      sniptale_popup_page_package_preferences: {
        schemaVersion: 1,
        export: DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.export,
        save: {
          ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.save,
          includeFullPageScreenshot: false,
        },
      },
    });

  await expect(loadPopupPagePackagePreferences()).resolves.toEqual(
    DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES
  );
  await expect(loadPopupPagePackagePreferences()).resolves.toEqual(
    DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES
  );
  await expect(loadPopupPagePackagePreferences()).resolves.toEqual(
    DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES
  );
});

it('persists the versioned schema and surfaces write failures', async () => {
  const preferences = DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES;
  setMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota'));

  await expect(savePopupPagePackagePreferences(preferences)).resolves.toBeUndefined();
  expect(setMock).toHaveBeenCalledWith({
    sniptale_popup_page_package_preferences: { schemaVersion: 1, ...preferences },
  });
  await expect(savePopupPagePackagePreferences(preferences)).rejects.toThrow('quota');
});

it('refuses to persist a Library selection without its required screenshot', async () => {
  await expect(
    savePopupPagePackagePreferences({
      ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES,
      save: {
        ...DEFAULT_POPUP_PAGE_PACKAGE_PREFERENCES.save,
        includeFullPageScreenshot: false,
      },
    })
  ).rejects.toThrow('must include the full-page screenshot');
  expect(setMock).not.toHaveBeenCalled();
});
