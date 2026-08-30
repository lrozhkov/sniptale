import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChromeEvent, clearStoredItems } from './browser-mocks.shared';
import { attachHarnessStorageArea, createHarnessStorageMock } from './browser-mocks.storage';

function expectThemeChangeHistory(listener: ReturnType<typeof vi.fn>) {
  expect(listener).toHaveBeenNthCalledWith(
    2,
    {
      theme: {
        oldValue: 'light',
        newValue: 'dark',
      },
    },
    'local'
  );
  expect(listener).toHaveBeenNthCalledWith(
    3,
    {
      theme: {
        oldValue: 'dark',
        newValue: undefined,
      },
    },
    'local'
  );
}

function createAttachedStorageArea(
  storageOnChanged: ChromeEvent<
    [Record<string, chrome.storage.StorageChange>, chrome.storage.AreaName]
  >
) {
  const area = {
    get: vi.fn(),
    remove: vi.fn(),
    set: vi.fn(),
  };

  attachHarnessStorageArea(area, 'local', storageOnChanged);
  return area;
}

afterEach(() => {
  clearStoredItems();
  vi.restoreAllMocks();
});

describe('browser-mocks.storage', () => {
  it('preserves oldValue semantics for per-area storage writes and removals', async () => {
    const storage = createHarnessStorageMock();
    const listener = vi.fn();
    storage.onChanged.addListener(listener);

    await storage.local.set({ theme: 'light' });
    await storage.local.set({ theme: 'dark' });
    await storage.local.remove('theme');

    expectThemeChangeHistory(listener);
  });

  it('emits shared harness storage changes with the previous snapshot values', async () => {
    const storageOnChanged = new ChromeEvent<
      [Record<string, chrome.storage.StorageChange>, chrome.storage.AreaName]
    >();
    const listener = vi.fn();
    storageOnChanged.addListener(listener);
    const area = createAttachedStorageArea(storageOnChanged);

    await area.set({ theme: 'light' });
    await area.set({ theme: 'dark' });
    await area.remove('theme');

    expectThemeChangeHistory(listener);
  });
});
