import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  browserStorageSyncGetMock,
  browserStorageSyncRemoveMock,
  browserStorageSyncSetMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  browserStorageSyncGetMock: vi.fn(),
  browserStorageSyncRemoveMock: vi.fn(),
  browserStorageSyncSetMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      remove: vi.fn(),
      set: vi.fn(),
    },
    sync: {
      get: browserStorageSyncGetMock,
      remove: browserStorageSyncRemoveMock,
      set: browserStorageSyncSetMock,
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: loggerWarnMock,
  })),
}));

import { loadSettings } from './index';

function resetSettingsReadPurityMocks(): void {
  vi.clearAllMocks();
  browserStorageSyncGetMock.mockResolvedValue({});
  browserStorageSyncRemoveMock.mockResolvedValue(undefined);
  browserStorageSyncSetMock.mockResolvedValue(undefined);
}

describe('settings read-path purity', () => {
  beforeEach(resetSettingsReadPurityMocks);

  it('drops invalid stored fields without repairing storage on read', async () => {
    browserStorageSyncGetMock.mockResolvedValueOnce({
      sniptale_settings: {
        captureAction: 'copy',
        contextMenu: {
          enabled: true,
          showPageLinkCopy: false,
          showSettings: 'invalid',
        },
        imageFormat: 'gif',
        imageQuality: 75,
      },
    });

    await expect(loadSettings()).resolves.toMatchObject({
      captureAction: 'copy',
      contextMenu: expect.objectContaining({
        showPageLinkCopy: false,
        showSettings: true,
      }),
      imageFormat: 'png',
      imageQuality: 75,
    });

    expect(loggerWarnMock).toHaveBeenCalledWith('Dropped invalid settings fields from storage', {
      invalidFieldCount: expect.any(Number),
    });
    expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
    expect(browserStorageSyncRemoveMock).not.toHaveBeenCalled();
  });

  it('normalizes a legacy scenario default without writes and preserves other preferences', async () => {
    browserStorageSyncGetMock.mockResolvedValue({
      sniptale_settings: {
        captureAction: 'scenario',
        imageFormat: 'webp',
        imageQuality: 71,
        captureDelay: 5,
      },
    });
    await expect(loadSettings()).resolves.toMatchObject({
      captureAction: 'download_default',
      imageFormat: 'webp',
      imageQuality: 71,
    });
    expect(browserStorageSyncSetMock).not.toHaveBeenCalled();
  });
});
