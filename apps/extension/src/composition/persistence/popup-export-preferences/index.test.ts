import { beforeEach, expect, it, vi } from 'vitest';

const { getMock, setMock } = vi.hoisted(() => ({ getMock: vi.fn(), setMock: vi.fn() }));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: { local: { get: getMock, set: setMock } },
}));

import {
  DEFAULT_POPUP_EXPORT_PREFERENCES,
  loadPopupExportPreferences,
  savePopupExportPreferences,
} from './index';

beforeEach(() => vi.clearAllMocks());

it('parses partial preferences and falls back on read failure', async () => {
  getMock
    .mockResolvedValueOnce({
      sniptale_popup_export_preferences: { includeFiles: false, includeMarkdown: false },
    })
    .mockRejectedValueOnce(new Error('unavailable'));

  await expect(loadPopupExportPreferences()).resolves.toEqual({
    ...DEFAULT_POPUP_EXPORT_PREFERENCES,
    includeFiles: false,
    includeMarkdown: false,
  });
  await expect(loadPopupExportPreferences()).resolves.toEqual(DEFAULT_POPUP_EXPORT_PREFERENCES);
});

it('persists preferences and rejects failed writes', async () => {
  const preferences = { ...DEFAULT_POPUP_EXPORT_PREFERENCES, includeBasicLogs: true };
  setMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota'));

  await expect(savePopupExportPreferences(preferences)).resolves.toBeUndefined();
  await expect(savePopupExportPreferences(preferences)).rejects.toThrow('quota');
  expect(setMock).toHaveBeenCalledWith({ sniptale_popup_export_preferences: preferences });
});

it('drops invalid stored roots and fields without mutating defaults', async () => {
  getMock
    .mockResolvedValueOnce({ sniptale_popup_export_preferences: undefined })
    .mockResolvedValueOnce({ sniptale_popup_export_preferences: null })
    .mockResolvedValueOnce({
      sniptale_popup_export_preferences: {
        includeFiles: 'yes',
        includeImages: false,
      },
    });

  await expect(loadPopupExportPreferences()).resolves.toEqual(DEFAULT_POPUP_EXPORT_PREFERENCES);
  await expect(loadPopupExportPreferences()).resolves.toEqual(DEFAULT_POPUP_EXPORT_PREFERENCES);
  await expect(loadPopupExportPreferences()).resolves.toEqual({
    ...DEFAULT_POPUP_EXPORT_PREFERENCES,
    includeImages: false,
  });
});
