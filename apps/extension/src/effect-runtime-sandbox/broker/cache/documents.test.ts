import { expect, it } from 'vitest';

import { ANIMATION_TEMPLATE_LIMITS } from '@sniptale/runtime-contracts/animation-template';
import { createAnimationDocument } from '../request-boundary.test-support';
import { createEffectRuntimeDocumentCache } from './documents';

it('keeps at most eight parsed documents and refreshes entries on reads', () => {
  const cache = createEffectRuntimeDocumentCache();
  for (let index = 0; index < 8; index += 1) {
    expect(cache.set({ document: createAnimationDocument(), id: `${index}`, source: '{}' })).toBe(
      true
    );
  }
  expect(cache.get('0')).not.toBeNull();
  cache.set({ document: createAnimationDocument(), id: '8', source: '{}' });

  expect(cache.get('1')).toBeNull();
  expect(cache.get('0')).not.toBeNull();
  expect(cache.snapshot()).toMatchObject({ entries: 8 });
});

it('rejects a single source above the ten MiB aggregate budget', () => {
  const cache = createEffectRuntimeDocumentCache();
  expect(
    cache.set({
      document: createAnimationDocument(),
      id: 'oversized',
      source: 'x'.repeat(ANIMATION_TEMPLATE_LIMITS.jsonBytes + 1),
    })
  ).toBe(false);
  expect(cache.snapshot()).toEqual({ entries: 0, sourceBytes: 0 });
});

it('uses the animation source budget rather than the retired eight MiB fixture limit', () => {
  const cache = createEffectRuntimeDocumentCache();
  expect(
    cache.set({
      document: createAnimationDocument(),
      id: 'larger',
      source: 'x'.repeat(8 * 1024 * 1024 + 1),
    })
  ).toBe(true);
  expect(cache.snapshot()).toEqual({ entries: 1, sourceBytes: 8 * 1024 * 1024 + 1 });
});
