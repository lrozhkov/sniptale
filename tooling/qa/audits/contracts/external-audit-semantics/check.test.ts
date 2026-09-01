import { expect, it } from 'vitest';

import { requiredExternalControlIds, semanticCases } from './test-support';

it('covers semantic hostile results for every profile-required external adapter', () => {
  const requiredIds = requiredExternalControlIds();
  expect(
    semanticCases
      .map(({ id }) => id)
      .filter((id) => requiredIds.includes(id))
      .sort()
  ).toEqual(requiredIds);
});

it.each(semanticCases)('$id blocks contradictory or unclassifiable result content', ({ run }) => {
  let blocked: boolean;
  try {
    const result = run();
    blocked = result.status === 'failed' || result.violations.length > 0;
  } catch {
    blocked = true;
  }
  expect(blocked).toBe(true);
});
