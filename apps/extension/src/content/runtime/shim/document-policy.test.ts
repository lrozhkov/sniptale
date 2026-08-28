import { expect, it } from 'vitest';

import { isContentRuntimeShimDocument } from './document-policy';

it('runs the content shim only in non-extension documents', () => {
  expect(isContentRuntimeShimDocument({ protocol: 'https:' })).toBe(true);
  expect(isContentRuntimeShimDocument({ protocol: 'http:' })).toBe(true);
  expect(isContentRuntimeShimDocument({ protocol: 'file:' })).toBe(true);
  expect(isContentRuntimeShimDocument({ protocol: 'chrome-extension:' })).toBe(false);
  expect(isContentRuntimeShimDocument({ protocol: 'moz-extension:' })).toBe(false);
});
