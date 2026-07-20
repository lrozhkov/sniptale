// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import type { ContentRuntimeShimBrowserAdapter } from '@sniptale/platform/browser/content-runtime-shim';

import { createShimQuickActionLoader, createShimQuickActionStorage } from './quick-actions';

function createBrowserAdapter(payload: Record<string, unknown>): ContentRuntimeShimBrowserAdapter {
  return {
    canObserveStorageChanges: vi.fn(() => true),
    getLocalStorage: vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.map((key) => [key, payload[key]]))
    ),
    subscribeToStorageChanges: vi.fn(() => () => undefined),
  };
}

it('loads only compact quick-action hotkey fields from browser storage', async () => {
  const browser = createBrowserAdapter({
    sniptale_quick_actions: [
      {
        hotkey: { altKey: false, ctrlKey: true, key: 'k', metaKey: false, shiftKey: false },
        id: 'quick-action-1',
        name: 'ignored',
        status: true,
      },
      {
        hotkey: { ctrlKey: true, key: 'x' },
        id: 'invalid-hotkey',
        status: true,
      },
      {
        hotkey: null,
        id: 'without-hotkey',
        status: false,
      },
    ],
  });

  await expect(createShimQuickActionLoader(browser)()).resolves.toEqual([
    {
      hotkey: { altKey: false, ctrlKey: true, key: 'k', metaKey: false, shiftKey: false },
      id: 'quick-action-1',
      status: true,
    },
    {
      hotkey: null,
      id: 'without-hotkey',
      status: false,
    },
  ]);
  expect(browser.getLocalStorage).toHaveBeenCalledWith(['sniptale_quick_actions']);
});

it('returns no actions when browser storage is unavailable', async () => {
  const browser = createBrowserAdapter({});
  vi.mocked(browser.getLocalStorage).mockRejectedValue(new Error('storage unavailable'));

  await expect(createShimQuickActionLoader(browser)()).resolves.toEqual([]);
});

it('subscribes to storage changes through the compact observer', () => {
  const browser = createBrowserAdapter({});
  const listener = vi.fn();
  const storage = createShimQuickActionStorage(browser);

  expect(storage.canObserveChanges()).toBe(true);
  const unsubscribe = storage.subscribeToChanges(listener);
  unsubscribe();

  expect(browser.subscribeToStorageChanges).toHaveBeenCalledWith(listener);
});
