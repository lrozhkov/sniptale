import { expect, it } from 'vitest';
import { readCatalogTranslation } from './catalog-reader';
import type { AppLocale } from './types';

const catalogs = {
  en: { actions: { save: 'Save', empty: '' }, onlyEnglish: 'English' },
  ru: { actions: { save: 'Сохранить', empty: '' }, onlyRussian: 'Русский' },
};

it('reads a selected locale and falls back to Russian for unavailable values', () => {
  expect(readCatalogTranslation(catalogs, 'en', 'actions.save')).toBe('Save');
  expect(readCatalogTranslation(catalogs, 'en', 'onlyRussian')).toBe('Русский');
  expect(readCatalogTranslation(catalogs, 'fr' as AppLocale, 'actions.save')).toBe('Сохранить');
});

it('preserves empty text and returns unknown or non-leaf paths unchanged', () => {
  expect(readCatalogTranslation(catalogs, 'en', 'actions.empty')).toBe('');
  for (const key of ['actions', 'missing.key', '__proto__.toString', 'constructor']) {
    expect(readCatalogTranslation(catalogs, 'en', key)).toBe(key);
  }
});
