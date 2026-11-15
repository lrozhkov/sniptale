import { expect, it, vi } from 'vitest';
import { catalogs } from 'sniptale:i18n/content-shim';
import { readCatalogTranslation } from '../../../platform/i18n/catalog-reader';
import type { AppLocale } from '@sniptale/platform/i18n/config';
import { loadCatalogMessages } from '../../../platform/i18n/catalog-transport';

vi.mock('../../../platform/i18n/catalog-transport', async () => {
  const { catalogs } = await import('sniptale:i18n/content-shim');
  return {
    loadCatalogMessages: vi.fn(async (locale: AppLocale) => {
      const messages: Record<string, string> = {};
      const collect = (value: unknown, prefix: string) => {
        if (typeof value === 'string') {
          messages[prefix] = value;
          return;
        }
        if (value && typeof value === 'object')
          for (const [key, child] of Object.entries(value))
            collect(child, prefix ? `${prefix}.${key}` : key);
      };
      collect(catalogs[locale], '');
      return messages;
    }),
  };
});

function translator(locale: AppLocale) {
  return (key: string) => readCatalogTranslation(catalogs, locale, key);
}

import type { ContentRuntimeShimBrowserAdapter } from '@sniptale/platform/browser/content-runtime-shim';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@sniptale/platform/i18n/config';
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
    locale: DEFAULT_LOCALE,
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
    locale: DEFAULT_LOCALE,
    theme: 'system',
    preferences: { enabled: true },
  });
  vi.mocked(adapter.getSyncStorage).mockRejectedValue(new Error('settings unavailable'));
  await expect(createShimPreferencesLoader(adapter)()).rejects.toThrow('settings unavailable');
});
it.each(SUPPORTED_LOCALES)('retains the registered language %s', async (locale) => {
  const load = createShimPreferencesLoader(browser({}, { 'sniptale-locale-preference': locale }));
  expect((await load()).locale).toBe(locale);
});

it('uses the default language for an unregistered storage value', async () => {
  const load = createShimPreferencesLoader(
    browser({}, { 'sniptale-locale-preference': 'unregistered' })
  );
  expect((await load()).locale).toBe(DEFAULT_LOCALE);
});
it('localizes bundled labels but preserves explicitly customized names', () => {
  const action = {
    id: 'default-visible-download',
    status: true,
    hotkey: null,
    name: 'Saved old locale',
  };
  expect(getShimQuickActionName(action, translator('en'))).toBe('Download visible area');
  expect(getShimQuickActionName(action, translator('ru'))).toBe('Скачать видимую область');
  expect(getShimQuickActionName({ ...action, customized: true }, translator('en'))).toBe(
    'Saved old locale'
  );
  expect(
    getShimQuickActionName(
      { id: 'custom', name: ' My capture ', status: true, hotkey: null },
      translator('en')
    )
  ).toBe('My capture');
});

it('publishes launcher text only after its selected catalog is prepared', async () => {
  let complete!: (messages: Record<string, string>) => void;
  vi.mocked(loadCatalogMessages).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    })
  );
  const load = createShimPreferencesLoader(
    browser(
      { sniptale_settings: { pageLaunch: { enabled: true } } },
      { 'sniptale-locale-preference': 'en' }
    )
  );
  let ready = false;
  const pending = load().then((presentation) => {
    ready = true;
    return presentation;
  });
  for (let index = 0; index < 8; index++) await Promise.resolve();
  expect(ready).toBe(false);
  complete({ 'content.pageLauncher.open': 'Prepared toolbar' });
  const presentation = await pending;
  expect(presentation.translate('content.pageLauncher.open')).toBe('Prepared toolbar');
});
