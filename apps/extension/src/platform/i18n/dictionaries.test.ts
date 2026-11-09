import { expect, it } from 'vitest';
import en from './catalogs/en.json';
import ru from './catalogs/ru.json';
import { getResolvedDictionaries } from './dictionaries';

it('uses bundled catalogs without rebuilding locale trees', () => {
  const catalogs = getResolvedDictionaries();
  expect(catalogs.en).toBe(en);
  expect(catalogs.ru).toBe(ru);
  expect(getResolvedDictionaries()).toBe(catalogs);
});
