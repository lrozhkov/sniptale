import { expect, it } from 'vitest';

import { createEffectRuntimePreparedModelCache } from './models';

it('keeps eight prepared models and refreshes reads in LRU order', () => {
  const cache = createEffectRuntimePreparedModelCache<{ id: number }>();
  for (let index = 0; index < 8; index += 1) cache.set(`${index}`, { id: index });
  expect(cache.get('0')).toEqual({ id: 0 });
  cache.set('8', { id: 8 });

  expect(cache.get('1')).toBeNull();
  expect(cache.get('0')).toEqual({ id: 0 });
  expect(cache.snapshot()).toEqual({ entries: 8 });
  cache.clear();
  expect(cache.snapshot()).toEqual({ entries: 0 });
});
