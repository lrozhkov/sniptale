import { expect, it } from 'vitest';
import { namedCatalog } from './catalog-data';
import { filterCatalog } from './catalog-model';
it('loads the packaged full catalog and searches CSS aliases and actual names locally', () => {
  expect(namedCatalog.length).toBeGreaterThan(30000);
  expect(new Set(namedCatalog.map((color) => color.hex)).size).toBe(namedCatalog.length);
  expect(
    filterCatalog(namedCatalog, 'rebeccapurple', 'all').some((color) => color.hex === '#663399')
  ).toBe(true);
  expect(filterCatalog(namedCatalog, 'coral', 'all').length).toBeGreaterThan(2);
});
