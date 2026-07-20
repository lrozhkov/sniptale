// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import type { EffectRuntimeWorkerAsset } from '../../../contracts/effect-runtime/types';
import { createEffectRuntimeWorkerAssetCache } from './assets';

it('evicts least-recently-used selections at 64 decoded entries and closes images once', () => {
  const cache = createEffectRuntimeWorkerAssetCache();
  const evicted = createBitmap();
  expect(cache.set('first', { first: createAsset('first', evicted) })).toBe(true);
  const retained = Array.from({ length: 64 }, () => createBitmap());
  expect(
    cache.set(
      'second',
      Object.fromEntries(
        retained.map((bitmap, index) => [`asset-${index}`, createAsset(`asset-${index}`, bitmap)])
      )
    )
  ).toBe(true);

  expect(cache.get('first')).toBeNull();
  expect(evicted.close).toHaveBeenCalledOnce();
  expect(cache.snapshot()).toEqual({ bytes: 256, entries: 64, selections: 1 });
  cache.clear();
  expect(retained.every(({ close }) => close.mock.calls.length === 1)).toBe(true);
  expect(evicted.close).toHaveBeenCalledOnce();
});

it('closes a replaced selection bitmap exactly once', () => {
  const cache = createEffectRuntimeWorkerAssetCache();
  const replaced = createBitmap();
  const replacement = createBitmap();
  cache.set('selection', { image: createAsset('image', replaced) });
  cache.set('selection', { image: createAsset('image', replacement) });

  expect(replaced.close).toHaveBeenCalledOnce();
  cache.clear();
  expect(replaced.close).toHaveBeenCalledOnce();
  expect(replacement.close).toHaveBeenCalledOnce();
});

function createAsset(id: string, bitmap: ImageBitmap): EffectRuntimeWorkerAsset {
  return {
    bitmap,
    cacheKey: id,
    height: 1,
    id,
    kind: 'image',
    mimeType: 'image/png',
    width: 1,
  };
}

function createBitmap(): ImageBitmap & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn(), height: 1, width: 1 } as ImageBitmap & {
    close: ReturnType<typeof vi.fn>;
  };
}
