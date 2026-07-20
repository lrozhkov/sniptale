import { expect, it } from 'vitest';

import { createDocument } from '../../worker/interpreter/support.test-support';
import { createEffectRuntimeDocumentCache } from './documents';

it('keeps at most eight parsed documents and refreshes entries on reads', () => {
  const cache = createEffectRuntimeDocumentCache();
  for (let index = 0; index < 8; index += 1) {
    expect(
      cache.set({ document: createDocument([{ op: 'clear' }]), id: `${index}`, source: '{}' })
    ).toBe(true);
  }
  expect(cache.get('0')).not.toBeNull();
  cache.set({ document: createDocument([{ op: 'clear' }]), id: '8', source: '{}' });

  expect(cache.get('1')).toBeNull();
  expect(cache.get('0')).not.toBeNull();
  expect(cache.snapshot()).toMatchObject({ entries: 8 });
});

it('rejects a single source above the eight MiB aggregate budget', () => {
  const cache = createEffectRuntimeDocumentCache();
  expect(
    cache.set({
      document: createDocument([{ op: 'clear' }]),
      id: 'oversized',
      source: 'x'.repeat(8 * 1024 * 1024 + 1),
    })
  ).toBe(false);
  expect(cache.snapshot()).toEqual({ entries: 0, sourceBytes: 0 });
});
