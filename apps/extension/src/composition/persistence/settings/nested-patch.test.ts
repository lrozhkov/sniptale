import { beforeEach, describe, expect, it, vi } from 'vitest';

const { browserStorageSyncGetMock, browserStorageSyncSetMock } = vi.hoisted(() => ({
  browserStorageSyncGetMock: vi.fn(),
  browserStorageSyncSetMock: vi.fn(),
}));

vi.mock('../infrastructure/browser-storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../infrastructure/browser-storage')>()),
  browserStorage: {
    sync: {
      get: browserStorageSyncGetMock,
      remove: vi.fn(),
      set: browserStorageSyncSetMock,
    },
  },
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    warn: vi.fn(),
  })),
}));

import { createDefaultSettings, patchSettings } from './index';

function resetSettingsNestedPatchMocks(): void {
  vi.clearAllMocks();
  browserStorageSyncGetMock.mockResolvedValue({});
  browserStorageSyncSetMock.mockResolvedValue(undefined);
}

function arrangeStoredSettingsWithNestedSiblings(): void {
  const initialSettings = createDefaultSettings();
  browserStorageSyncGetMock.mockResolvedValueOnce({
    sniptale_settings: {
      ...initialSettings,
      contentToolbar: {
        displayMode: 'vertical',
        compactMenus: true,
        position: { x: 32, y: 48 },
      },
      contextMenu: {
        ...initialSettings.contextMenu,
        showGallery: false,
        showSettings: true,
      },
    },
  });
}

function expectPersistedNestedMerge(): void {
  expect(browserStorageSyncSetMock).toHaveBeenCalledWith({
    sniptale_settings: expect.objectContaining({
      contentToolbar: {
        displayMode: 'vertical',
        compactMenus: true,
        position: { x: 96, y: 120 },
      },
      contextMenu: expect.objectContaining({
        showGallery: false,
        showSettings: false,
      }),
    }),
  });
}

describe('settings nested patch persistence', () => {
  beforeEach(resetSettingsNestedPatchMocks);

  it('merges nested patches without replacing sibling settings fields', async () => {
    arrangeStoredSettingsWithNestedSiblings();

    await expect(
      patchSettings({
        contentToolbar: { position: { x: 96, y: 120 } },
        contextMenu: { showSettings: false },
      })
    ).resolves.toMatchObject({
      contentToolbar: {
        displayMode: 'vertical',
        compactMenus: true,
        position: { x: 96, y: 120 },
      },
      contextMenu: {
        showGallery: false,
        showSettings: false,
      },
    });

    expectPersistedNestedMerge();
  });
});
