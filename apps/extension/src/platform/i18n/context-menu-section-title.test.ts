import { beforeAll, expect, it, vi } from 'vitest';
import * as i18n from '.';
import { catalogFixtureMessages } from './catalog-fixture.test-support';
import type { AppLocale } from './types';
import { contextMenuSectionTitle } from './context-menu-section-title';

vi.mock('./catalog-transport', () => ({
  loadCatalogMessages: vi.fn(async (locale: AppLocale) => catalogFixtureMessages(locale)),
}));

beforeAll(async () => {
  await i18n.prepareTranslations('settings', 'ru');
});

it('translates generated menu headings but preserves user-custom titles', () => {
  expect(contextMenuSectionTitle('recommended-screenshots', 'Screenshots', 'ru')).toBe('Снимки');
  expect(contextMenuSectionTitle('block-page-link', 'Copy title and link', 'ru')).toBe(
    'Копировать название и ссылку'
  );
  expect(contextMenuSectionTitle('recommended-screenshots', 'My capture', 'ru')).toBe('My capture');
  expect(contextMenuSectionTitle('tools', 'Tools', 'ru')).toBe('Tools');
});

it('reads only the requested locale for canonical and historical generated headings', () => {
  const translate = vi.spyOn(i18n, 'translate');
  try {
    expect(contextMenuSectionTitle('recommended-screenshots', 'Снимки', 'en')).toBe('Screenshots');
    expect(translate).toHaveBeenCalledExactlyOnceWith(
      'settings.appearance.contextMenuGroupScreenshots',
      'en'
    );
    translate.mockClear();
    expect(contextMenuSectionTitle('block-video', 'My video tools', 'en')).toBe('My video tools');
    expect(translate).not.toHaveBeenCalled();
  } finally {
    translate.mockRestore();
  }
});
