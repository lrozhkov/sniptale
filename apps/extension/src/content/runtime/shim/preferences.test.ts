import { expect, it, vi } from 'vitest';
import type { ContentRuntimeShimBrowserAdapter } from '@sniptale/platform/browser/content-runtime-shim';
import { createShimPreferencesLoader, getShimQuickActionName } from './preferences';
function browser(
  sync: Record<string, unknown>,
  local: Record<string, unknown> = {}
): ContentRuntimeShimBrowserAdapter {
  return {
    getSyncStorage: vi.fn(async () => sync),
    getLocalStorage: vi.fn(async () => local),
    canObserveStorageChanges: () => false,
    subscribeToStorageChanges: () => () => undefined,
  };
}
it('opens with safe defaults without a storage writer or permission request', async () => {
  const adapter = browser({});
  expect(await createShimPreferencesLoader(adapter)()).toMatchObject({
    preferences: {
      enabled: false,
      hoverOnly: false,
      corner: 'bottom-right',
      quickActionsPopup: true,
      quickActionsCorner: false,
      quickActionsToolbar: false,
    },
    locale: 'ru',
    theme: 'system',
  });
  expect(adapter.getSyncStorage).toHaveBeenCalledWith(['sniptale_settings']);
});
it('reads the same persisted corner and independent places with locale and theme', async () => {
  const load = createShimPreferencesLoader(
    browser(
      {
        sniptale_settings: {
          pageLaunch: { enabled: true, corner: 'top-left', quickActionsToolbar: true },
        },
      },
      { 'sniptale-locale-preference': 'en', 'sniptale-theme-preference': 'dark' }
    )
  );
  expect(await load()).toMatchObject({
    locale: 'en',
    theme: 'dark',
    preferences: {
      enabled: true,
      corner: 'top-left',
      quickActionsToolbar: true,
      quickActionsCorner: false,
    },
  });
});
it('propagates settings refusal while optional presentation failure uses safe defaults', async () => {
  const adapter = browser({ sniptale_settings: { pageLaunch: { enabled: true } } });
  vi.mocked(adapter.getLocalStorage).mockRejectedValue(new Error('presentation unavailable'));
  await expect(createShimPreferencesLoader(adapter)()).resolves.toMatchObject({
    locale: 'ru',
    theme: 'system',
    preferences: { enabled: true },
  });
  vi.mocked(adapter.getSyncStorage).mockRejectedValue(new Error('settings unavailable'));
  await expect(createShimPreferencesLoader(adapter)()).rejects.toThrow('settings unavailable');
});
it('localizes bundled labels but preserves explicitly customized names', () => {
  const action = {
    id: 'default-visible-download',
    status: true,
    hotkey: null,
    name: 'Saved old locale',
  };
  expect(getShimQuickActionName(action, 'en')).toBe('Download visible area');
  expect(getShimQuickActionName(action, 'ru')).toBe('Скачать видимую область');
  expect(getShimQuickActionName({ ...action, customized: true }, 'en')).toBe('Saved old locale');
  expect(
    getShimQuickActionName({ id: 'custom', name: ' My capture ', status: true, hotkey: null }, 'en')
  ).toBe('My capture');
});
