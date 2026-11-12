import { expect, it, vi } from 'vitest';

import { createEffectRuntimePreparedModelCache } from './models';

it('keeps eight prepared models and refreshes reads in LRU order', () => {
  const cache = createEffectRuntimePreparedModelCache<{ id: number }>();
  for (let index = 0; index < 8; index += 1) cache.set(`${index}`, { id: index });
  expect(cache.get('0')).toEqual({ id: 0 });
  cache.set('8', { id: 8 });

  expect(cache.get('1')).toBeNull();
  expect(cache.get('0')).toEqual({ id: 0 });
  expect(cache.snapshot()).toEqual({ entries: 8, weight: 0 });
  cache.clear();
  expect(cache.snapshot()).toEqual({ entries: 0, weight: 0 });
});

it('retires evicted, replaced and cleared players once while preserving rejected entries', () => {
  const dispose = vi.fn();
  const cache = createEffectRuntimePreparedModelCache<{ bytes: number }>({
    dispose,
    weight: (value) => value.bytes,
    maximumWeight: 10,
  });
  const a = { bytes: 6 },
    b = { bytes: 5 },
    replacement = { bytes: 4 };
  expect(cache.set('a', a)).toBe(true);
  expect(cache.set('b', b)).toBe(true);
  expect(dispose.mock.calls).toEqual([[a]]);
  expect(cache.set('b', b)).toBe(true);
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(cache.set('b', { bytes: 11 })).toBe(false);
  expect(cache.get('b')).toBe(b);
  expect(cache.set('b', replacement)).toBe(true);
  expect(dispose.mock.calls).toEqual([[a], [b]]);
  cache.clear();
  cache.clear();
  expect(dispose.mock.calls).toEqual([[a], [b], [replacement]]);
  expect(cache.snapshot()).toEqual({ entries: 0, weight: 0 });
});
