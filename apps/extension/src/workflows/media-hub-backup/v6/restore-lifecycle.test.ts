import { expect, it } from 'vitest';
import { rebaseTemporaryLifecycle } from './restore-lifecycle';

it('rebases temporary retention without changing saved library lifecycle', () => {
  expect(
    rebaseTemporaryLifecycle(
      { lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 10 }, updatedAt: 5 },
      100
    )
  ).toEqual({
    lifecycle: { savedAt: null, storageClass: 'temporary', updatedAt: 100 },
    updatedAt: 5,
  });
  const library = { lifecycle: { savedAt: 10, storageClass: 'library' as const, updatedAt: 10 } };
  expect(rebaseTemporaryLifecycle(library, 100)).toBe(library);
});
