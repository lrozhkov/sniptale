import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserStorageSyncGetMock, browserStorageSyncSetMock } = vi.hoisted(() => ({
  browserStorageSyncGetMock: vi.fn(),
  browserStorageSyncSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    sync: {
      get: browserStorageSyncGetMock,
      remove: vi.fn(),
      set: browserStorageSyncSetMock,
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

import { createDefaultSettings, patchSettings, resetSettingsToDefaults } from './index';

describe('settings mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    browserStorageSyncSetMock.mockResolvedValue(undefined);
    browserStorageSyncGetMock.mockResolvedValue({
      sniptale_settings: {
        ...createDefaultSettings(),
        captureAction: 'ask_system',
      },
    });
  });

  it('normalizes and persists patched settings through the mutation queue', async () => {
    await expect(
      patchSettings({
        captureAction: 'copy',
        contextMenu: {
          ...createDefaultSettings().contextMenu,
          showPageLinkCopy: false,
        },
      })
    ).resolves.toMatchObject({
      captureAction: 'copy',
      contextMenu: expect.objectContaining({ showPageLinkCopy: false }),
    });

    expect(browserStorageSyncSetMock).toHaveBeenCalledWith({
      sniptale_settings: expect.objectContaining({
        captureAction: 'copy',
        contextMenu: expect.objectContaining({ showPageLinkCopy: false }),
      }),
    });
  });

  it('resets settings to fresh defaults', async () => {
    await expect(resetSettingsToDefaults()).resolves.toMatchObject({
      captureAction: 'download_default',
      contextMenu: expect.objectContaining({ showPageLinkCopy: true }),
    });

    expect(browserStorageSyncSetMock).toHaveBeenCalledWith({
      sniptale_settings: expect.objectContaining({
        captureAction: 'download_default',
        contextMenu: expect.objectContaining({ showPageLinkCopy: true }),
      }),
    });
  });
});
