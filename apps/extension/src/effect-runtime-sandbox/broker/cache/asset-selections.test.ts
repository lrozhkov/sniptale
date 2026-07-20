import { expect, it } from 'vitest';

import { createEffectRuntimeAssetSelectionCache } from './asset-selections';

it('keeps 64 acknowledged asset selections and refreshes reads in LRU order', () => {
  const cache = createEffectRuntimeAssetSelectionCache();
  for (let index = 0; index < 64; index += 1) cache.set(`${index}`);
  expect(cache.has('0')).toBe(true);
  cache.set('64');

  expect(cache.has('1')).toBe(false);
  expect(cache.has('0')).toBe(true);
  expect(cache.snapshot()).toEqual({ entries: 64 });
  cache.clear();
  expect(cache.snapshot()).toEqual({ entries: 0 });
});
