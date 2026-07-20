import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionGetMock, sessionSetMock } = vi.hoisted(() => ({
  sessionGetMock: vi.fn(),
  sessionSetMock: vi.fn(),
}));

vi.mock('../../composition/persistence/infrastructure/browser-storage', () => ({
  browserStorage: {
    session: {
      get: sessionGetMock,
      set: sessionSetMock,
    },
  },
}));

import {
  loadPopupExportTabSelectionSession,
  parsePopupExportTabSelectionSession,
  savePopupExportTabSelectionSession,
} from './export-tab-session';

beforeEach(() => {
  vi.clearAllMocks();
  sessionGetMock.mockResolvedValue({});
  sessionSetMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('popup export tab selection session parsing', () => {
  it('parses valid tab selection sessions and drops invalid tab ids', () => {
    expect(
      parsePopupExportTabSelectionSession({
        selectedTabIds: [7, 'bad', 9],
        tabsFingerprint: '7:1|9:0',
      })
    ).toEqual({
      selectedTabIds: [7, 9],
      tabsFingerprint: '7:1|9:0',
    });
  });

  it('rejects malformed tab selection session roots', () => {
    expect(parsePopupExportTabSelectionSession(null)).toBeNull();
    expect(parsePopupExportTabSelectionSession([])).toBeNull();
    expect(parsePopupExportTabSelectionSession({ selectedTabIds: [7] })).toBeNull();
    expect(
      parsePopupExportTabSelectionSession({
        selectedTabIds: {},
        tabsFingerprint: '7:1',
      })
    ).toBeNull();
  });
});

describe('popup export tab selection session persistence', () => {
  it('loads and fail-soft saves popup export tab selection session state', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    sessionGetMock.mockResolvedValueOnce({
      sniptale_popup_export_tab_selection_session: {
        selectedTabIds: [7],
        tabsFingerprint: '7:1',
      },
    });
    sessionSetMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota'));

    await expect(loadPopupExportTabSelectionSession()).resolves.toEqual({
      selectedTabIds: [7],
      tabsFingerprint: '7:1',
    });
    await expect(
      savePopupExportTabSelectionSession({ selectedTabIds: [7], tabsFingerprint: '7:1' })
    ).resolves.toBeUndefined();
    await expect(
      savePopupExportTabSelectionSession({ selectedTabIds: [9], tabsFingerprint: '9:1' })
    ).resolves.toBeUndefined();

    expect(sessionSetMock).toHaveBeenNthCalledWith(1, {
      sniptale_popup_export_tab_selection_session: {
        selectedTabIds: [7],
        tabsFingerprint: '7:1',
      },
    });
    expect(warnSpy).toHaveBeenCalledWith(
      '[PopupExportTabSelectionSession]',
      'Failed to save popup export tab selection session',
      expect.any(Error)
    );
  });
});
