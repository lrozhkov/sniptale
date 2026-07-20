import { expect, it } from 'vitest';

import { createEffectRuntimeAssetSelectionId, isEffectRuntimeImmutableId } from './immutable-refs';

it('accepts only lowercase exact-length SHA-256 immutable IDs', () => {
  expect(isEffectRuntimeImmutableId('a'.repeat(64))).toBe(true);
  expect(isEffectRuntimeImmutableId('A'.repeat(64))).toBe(false);
  expect(isEffectRuntimeImmutableId('a'.repeat(63))).toBe(false);
  expect(isEffectRuntimeImmutableId(null)).toBe(false);
});

it('derives an order-independent asset-selection ID with deterministic tie handling', async () => {
  const first = [
    { id: 'z', sha256: 'b'.repeat(64) },
    { id: 'a', sha256: 'a'.repeat(64) },
    { id: 'a', sha256: 'c'.repeat(64) },
  ];
  const forward = await createEffectRuntimeAssetSelectionId(first);
  const reverse = await createEffectRuntimeAssetSelectionId(first.toReversed());

  expect(forward).toBe(reverse);
  expect(isEffectRuntimeImmutableId(forward)).toBe(true);
});
