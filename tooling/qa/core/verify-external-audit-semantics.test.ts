import { expect, it } from 'vitest';

import {
  requiredExternalControlIds,
  semanticCases,
} from './verify-external-audit-semantics.test-support';

it('covers semantic hostile results for every profile-required external adapter', () => {
  expect(semanticCases.map(({ id }) => id).sort()).toEqual(requiredExternalControlIds());
});

it.each(semanticCases)('$id blocks contradictory or unclassifiable result content', ({ run }) => {
  let blocked = false;
  try {
    const result = run();
    blocked = result.status === 'failed' || result.violations.length > 0;
  } catch {
    blocked = true;
  }
  expect(blocked).toBe(true);
});
