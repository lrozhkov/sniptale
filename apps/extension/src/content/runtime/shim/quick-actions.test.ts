// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';
import type { ContentRuntimeShimBrowserAdapter } from '@sniptale/platform/browser/content-runtime-shim';

import { bundledQuickActionConfigs } from '../../../features/quick-actions-presets/bundled';
import { createShimQuickActionLoader, createShimQuickActionStorage } from './quick-actions';

function createBrowserAdapter(payload: Record<string, unknown>): ContentRuntimeShimBrowserAdapter {
  return {
    canObserveStorageChanges: vi.fn(() => true),
    getSyncStorage: vi.fn(async () => ({})),
    getLocalStorage: vi.fn(async (keys: string[]) =>
      Object.fromEntries(keys.map((key) => [key, payload[key]]))
    ),
    subscribeToStorageChanges: vi.fn(() => () => undefined),
  };
}

it('loads compact hotkey and menu display fields without artwork or capture settings', async () => {
  const browser = createBrowserAdapter({
    sniptale_quick_actions: [
      {
        hotkey: { altKey: false, ctrlKey: true, key: 'k', metaKey: false, shiftKey: false },
        id: 'quick-action-1',
        name: 'Menu action',
        appearance: { private: 'not projected' },
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

  const actions = await createShimQuickActionLoader(browser)();
  expect(actions).toHaveLength(9);
  expect(actions.slice(0, 2)).toEqual([
    {
      hotkey: { altKey: false, ctrlKey: true, key: 'k', metaKey: false, shiftKey: false },
      id: 'quick-action-1',
      name: 'Menu action',
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

it('shows the same seven bundled defaults before any explicit settings write', async () => {
  const browser = createBrowserAdapter({});
  const actions = await createShimQuickActionLoader(browser)();
  expect(actions.map((action) => action.id)).toEqual([
    'default-visible-download',
    'default-full-page-download',
    'default-selection-download',
    'default-visible-copy',
    'default-visible-edit',
    'default-desktop-capture',
    'default-visible-library',
  ]);
  expect(actions.every((action) => action.status && action.hotkey === null)).toBe(true);
  expect(browser.getLocalStorage).toHaveBeenCalledOnce();
});
it('admits optional hotkeys and appends missing defaults after the accepted stored order', async () => {
  const actions = await createShimQuickActionLoader(
    createBrowserAdapter({
      sniptale_quick_actions: [
        { id: 'custom', name: 'Custom', status: true },
        { id: 'default-visible-copy', status: false, hotkey: null },
      ],
    })
  )();
  expect(actions.slice(0, 2)).toEqual([
    { id: 'custom', name: 'Custom', status: true, hotkey: null },
    { id: 'default-visible-copy', icon: 'ClipboardCopy', status: false, hotkey: null },
  ]);
  expect(actions).toHaveLength(8);
  expect(actions.filter((action) => action.id === 'default-visible-copy')).toHaveLength(1);
});

it('projects only bounded icon identifiers and includes the bundled artwork', async () => {
  const actions = await createShimQuickActionLoader(
    createBrowserAdapter({
      sniptale_quick_actions: [
        { id: 'valid', status: true, icon: 'Zap', appearance: { private: 'omit' } },
        { id: 'unknown', status: true, icon: '__proto__' },
        { id: 'object', status: true, icon: { html: '<script>' } },
        { id: 'oversized', status: true, icon: 'x'.repeat(129) },
        { id: 'default-visible-copy', status: true, icon: null },
      ],
    })
  )();
  expect(actions.slice(0, 4)).toEqual([
    { id: 'valid', status: true, hotkey: null, icon: 'Zap' },
    { id: 'unknown', status: true, hotkey: null, icon: '__proto__' },
    { id: 'object', status: true, hotkey: null },
    { id: 'oversized', status: true, hotkey: null },
  ]);
  for (const bundled of bundledQuickActionConfigs) {
    expect(actions.find((action) => action.id === bundled.id)?.icon).toBe(bundled.icon);
  }
});
